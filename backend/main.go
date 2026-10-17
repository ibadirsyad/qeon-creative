package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const (
	serverAddress = ":8080"
	maxHTMLSize   = 3 * 1024 * 1024
)

type APIResponse struct {
	Status   string `json:"status"`
	Message  string `json:"message,omitempty"`
	Error    string `json:"error,omitempty"`
	ImageURL string `json:"imageUrl,omitempty"`
}

type tikTokOEmbedResponse struct {
	ThumbnailURL string `json:"thumbnail_url"`
	Title        string `json:"title"`
	Type         string `json:"type"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", healthHandler)
	mux.HandleFunc("/api/affiliate/preview-image", previewImageHandler)
	mux.HandleFunc("/api/ai/cover", aiCoverHandler)

	server := &http.Server{
		Addr:              serverAddress,
		Handler:           corsMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	log.Printf("Go API berjalan di http://localhost%s", serverAddress)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

type aiCoverRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Style       string `json:"style"`
	Count       int    `json:"count"`
}

type generatedCover struct {
	B64JSON  string `json:"b64Json"`
	MIMEType string `json:"mimeType"`
}

type aiCoverAPIResponse struct {
	Error  string           `json:"error,omitempty"`
	Images []generatedCover `json:"images,omitempty"`
}

func aiCoverHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Status: "error", Error: "Gunakan metode POST"})
		return
	}
	hfToken := strings.TrimSpace(os.Getenv("HF_TOKEN"))
	supabaseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	supabaseAnonKey := strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY"))
	if hfToken == "" || supabaseURL == "" || supabaseAnonKey == "" {
		writeJSON(w, http.StatusServiceUnavailable, APIResponse{Status: "error", Error: "Backend belum dikonfigurasi. Periksa HF_TOKEN, SUPABASE_URL, dan SUPABASE_ANON_KEY."})
		return
	}

	// Validasi sesi Supabase agar endpoint generator tidak dapat digunakan anonim.
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, APIResponse{Status: "error", Error: "Login diperlukan untuk menggunakan generator AI."})
		return
	}
	authReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, supabaseURL+"/auth/v1/user", nil)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, APIResponse{Status: "error", Error: "Tidak dapat memvalidasi sesi login."})
		return
	}
	authReq.Header.Set("Authorization", "Bearer "+token)
	authReq.Header.Set("apikey", supabaseAnonKey)
	authResp, err := (&http.Client{Timeout: 12 * time.Second}).Do(authReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Validasi login ke Supabase gagal. Coba lagi."})
		return
	}
	io.Copy(io.Discard, io.LimitReader(authResp.Body, 64*1024))
	authResp.Body.Close()
	if authResp.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusUnauthorized, APIResponse{Status: "error", Error: "Sesi login tidak valid atau sudah kedaluwarsa. Silakan login ulang."})
		return
	}

	var input aiCoverRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 12*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Data permintaan tidak valid."})
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.Style = strings.TrimSpace(input.Style)
	if input.Title == "" || len(input.Title) > 180 {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Judul wajib diisi dan maksimal 180 karakter."})
		return
	}
	if len(input.Description) > 800 {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Deskripsi tambahan maksimal 800 karakter."})
		return
	}
	if input.Count != 2 {
		input.Count = 2
	}
	allowedStyles := map[string]bool{
		"modern editorial": true, "photorealistic": true, "minimalist clean design": true,
		"bold vibrant social media design": true, "cinematic premium photography": true, "3D illustration": true,
	}
	if !allowedStyles[input.Style] {
		input.Style = "modern editorial"
	}

	prompt := fmt.Sprintf("Create a professional landscape cover image for a web article. Article title/topic: %q. Visual style: %s. Additional art direction: %s. Composition should be polished, high-quality and easy to understand at thumbnail size. Keep important subjects away from edges. No watermarks, logos, fake UI, or long text. The website displays the article title separately.", input.Title, input.Style, input.Description)
	model := strings.TrimSpace(os.Getenv("HF_IMAGE_MODEL"))
	if model == "" {
		model = "black-forest-labs/FLUX.1-schnell"
	}
	provider := strings.TrimSpace(os.Getenv("HF_IMAGE_PROVIDER"))
	if provider == "" {
		provider = "fal-ai"
	}
	if strings.Contains(model, "..") || strings.Contains(provider, "/") || strings.Contains(provider, "..") {
		writeJSON(w, http.StatusInternalServerError, APIResponse{Status: "error", Error: "Konfigurasi model Hugging Face tidak valid."})
		return
	}
	// Hugging Face memetakan FLUX.1-schnell ke provider model fal-ai/flux/schnell.
	// Endpoint provider-specific menggunakan skema prompt milik Fal, bukan skema generic `inputs`.
	providerModel := ""
	if provider == "fal-ai" {
		switch model {
		case "black-forest-labs/FLUX.1-schnell":
			providerModel = "flux/schnell"
		case "black-forest-labs/FLUX.1-dev":
			providerModel = "flux/dev"
		default:
			writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Model ini belum dipetakan untuk provider fal-ai. Gunakan black-forest-labs/FLUX.1-schnell atau FLUX.1-dev."})
			return
		}
	} else {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Provider yang dikonfigurasi belum didukung oleh handler ini. Gunakan HF_IMAGE_PROVIDER=fal-ai."})
		return
	}

	// Buat dua variasi. Fal mengembalikan URL gambar di JSON; backend mengambil gambar
	// tersebut dan mengirimnya ke frontend sebagai base64 agar tidak mengekspos token.
	client := &http.Client{Timeout: 150 * time.Second}
	images := make([]generatedCover, 0, 2)
	for i := 0; i < 2; i++ {
		body, _ := json.Marshal(map[string]any{
			"prompt":     fmt.Sprintf("%s Variation %d. Make this variation visually distinct while preserving the subject and style.", prompt, i+1),
			"image_size": "landscape_16_9",
			"num_images": 1,
		})
		endpoint := "https://router.huggingface.co/fal-ai/" + providerModel
		hfReq, reqErr := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
		if reqErr != nil {
			writeJSON(w, http.StatusInternalServerError, APIResponse{Status: "error", Error: "Gagal menyiapkan permintaan Hugging Face."})
			return
		}
		hfReq.Header.Set("Authorization", "Bearer "+hfToken)
		hfReq.Header.Set("Content-Type", "application/json")
		hfReq.Header.Set("Accept", "image/png, application/json")
		hfResp, callErr := client.Do(hfReq)
		if callErr != nil {
			log.Printf("Hugging Face image request failed: %v", callErr)
			writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Tidak dapat menghubungi Hugging Face. Coba lagi beberapa saat."})
			return
		}
		imageBytes, readErr := io.ReadAll(io.LimitReader(hfResp.Body, 15*1024*1024))
		contentType := strings.ToLower(strings.TrimSpace(strings.Split(hfResp.Header.Get("Content-Type"), ";")[0]))
		hfResp.Body.Close()
		if readErr != nil {
			writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Respons gambar dari Hugging Face tidak dapat dibaca."})
			return
		}
		if hfResp.StatusCode < 200 || hfResp.StatusCode >= 300 {
			message := "Hugging Face gagal membuat gambar. Periksa HF_TOKEN, izin Inference Providers, model, dan kuota akun."
			if len(imageBytes) > 0 && (contentType == "application/json" || strings.Contains(contentType, "text")) {
				var providerErr map[string]any
				if json.Unmarshal(imageBytes, &providerErr) == nil {
					if value, ok := providerErr["error"].(string); ok && value != "" {
						message = value
					}
				}
			}
			log.Printf("Hugging Face image API returned status %d: %s", hfResp.StatusCode, message)
			status := http.StatusBadGateway
			if hfResp.StatusCode == http.StatusTooManyRequests {
				status = http.StatusTooManyRequests
			}
			writeJSON(w, status, APIResponse{Status: "error", Error: message})
			return
		}
		if len(imageBytes) == 0 {
			writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Hugging Face mengembalikan respons kosong."})
			return
		}
		if strings.HasPrefix(contentType, "application/json") {
			var falResult struct {
				Images []struct {
					URL string `json:"url"`
				} `json:"images"`
			}
			if err := json.Unmarshal(imageBytes, &falResult); err != nil || len(falResult.Images) == 0 || falResult.Images[0].URL == "" {
				writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Respons Hugging Face tidak berisi URL gambar yang dikenali."})
				return
			}
			imageReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, falResult.Images[0].URL, nil)
			if err != nil {
				writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "URL gambar dari provider tidak valid."})
				return
			}
			imageResp, err := client.Do(imageReq)
			if err != nil {
				writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Gambar hasil AI tidak dapat diunduh."})
				return
			}
			imageBytes, err = io.ReadAll(io.LimitReader(imageResp.Body, 15*1024*1024))
			contentType = strings.ToLower(strings.TrimSpace(strings.Split(imageResp.Header.Get("Content-Type"), ";")[0]))
			imageResp.Body.Close()
			if err != nil || imageResp.StatusCode < 200 || imageResp.StatusCode >= 300 {
				writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Gagal mengunduh gambar hasil AI."})
				return
			}
		}
		if len(imageBytes) == 0 || !strings.HasPrefix(contentType, "image/") {
			writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Hugging Face tidak mengembalikan data gambar. Periksa model, provider, dan kuota akun."})
			return
		}
		mimeType := contentType
		if mimeType != "image/jpeg" && mimeType != "image/webp" {
			mimeType = "image/png"
		}
		images = append(images, generatedCover{B64JSON: base64.StdEncoding.EncodeToString(imageBytes), MIMEType: mimeType})
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(aiCoverAPIResponse{Images: images})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Status: "error", Error: "Metode tidak diizinkan"})
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{Status: "ok", Message: "Backend Go terhubung"})
}

func previewImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Status: "error", Error: "Gunakan metode GET"})
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Parameter url wajib diisi"})
		return
	}

	target, err := url.Parse(rawURL)
	if err != nil || target.Host == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "URL tidak valid"})
		return
	}
	if err := validateAffiliateURL(target); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: err.Error()})
		return
	}

	// Beberapa link berbagi produk Tokopedia/TikTok Shop menyertakan
	// metadata gambar langsung di parameter og_info. Baca lebih dahulu
	// agar tidak bergantung pada HTML yang mungkin dirender oleh JavaScript.
	if imageURL := extractSharedProductImage(target); imageURL != "" {
		writeJSON(w, http.StatusOK, APIResponse{
			Status:   "ok",
			Message:  "Gambar ditemukan dari metadata og_info pada link berbagi",
			ImageURL: imageURL,
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	// Untuk video TikTok, oEmbed biasanya lebih andal daripada membaca HTML.
	// Query tracking dihapus hanya untuk URL video TikTok, bukan untuk link produk/affiliate.
	if isTikTokHost(target.Hostname()) && strings.Contains(strings.ToLower(target.Path), "/video/") {
		videoURL := *target
		videoURL.RawQuery = ""
		videoURL.ForceQuery = false
		videoURL.Fragment = ""
		if imageURL, err := fetchTikTokOEmbed(ctx, videoURL.String()); err == nil && imageURL != "" {
			writeJSON(w, http.StatusOK, APIResponse{Status: "ok", Message: "Thumbnail ditemukan melalui TikTok oEmbed", ImageURL: imageURL})
			return
		} else if err != nil {
			log.Printf("TikTok oEmbed tidak berhasil; mencoba metadata halaman: %v", err)
		}
	}

	// Untuk link affiliate/produk, gunakan URL asli agar parameter redirect affiliate
	// tidak hilang. Redirect tetap dibatasi ke domain yang diizinkan.
	client := &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 6 {
				return fmt.Errorf("terlalu banyak pengalihan URL")
			}
			if err := validateAffiliateURL(req.URL); err != nil {
				return fmt.Errorf("pengalihan tidak diizinkan: %w", err)
			}
			return nil
		},
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Tidak dapat membuat permintaan"})
		return
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	request.Header.Set("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8")
	request.Header.Set("Accept-Language", "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7")

	response, err := client.Do(request)
	if err != nil {
		log.Printf("Gagal membuka URL affiliate: %v", err)
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Link affiliate tidak dapat diakses dari backend. Periksa link atau coba upload gambar manual."})
		return
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: fmt.Sprintf("Halaman tujuan menolak permintaan (HTTP %d). Coba link produk lengkap atau upload gambar manual.", response.StatusCode)})
		return
	}

	contentType := strings.ToLower(response.Header.Get("Content-Type"))
	if !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml+xml") {
		writeJSON(w, http.StatusUnsupportedMediaType, APIResponse{Status: "error", Error: "Link tujuan bukan halaman HTML. Gunakan URL produk langsung atau isi URL gambar secara manual."})
		return
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxHTMLSize+1))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Gagal membaca halaman tujuan"})
		return
	}
	if len(body) > maxHTMLSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, APIResponse{Status: "error", Error: "Halaman terlalu besar untuk diproses"})
		return
	}

	imageURL, err := extractImageURL(body, response.Request.URL)
	if err != nil {
		log.Printf("Metadata gambar tidak ditemukan pada %s: %v", response.Request.URL.Host, err)
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
			Status: "error",
			Error:  "Halaman tujuan tidak menyediakan metadata gambar yang bisa dibaca. Link affiliate pendek atau halaman yang dirender dengan JavaScript mungkin tidak didukung; coba link produk langsung atau upload gambar manual.",
		})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{Status: "ok", Message: "Gambar ditemukan dari metadata halaman", ImageURL: imageURL})
}

// extractSharedProductImage membaca metadata og_info dari link berbagi produk.
func extractSharedProductImage(target *url.URL) string {
	if target == nil {
		return ""
	}

	raw := target.Query().Get("og_info")
	if raw == "" {
		return ""
	}

	var metadata struct {
		Title string `json:"title"`
		Image string `json:"image"`
	}
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return ""
	}

	candidate := strings.TrimSpace(metadata.Image)
	parsed, err := url.Parse(candidate)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return ""
	}

	// Hanya izinkan host CDN gambar yang dikenal dari ByteDance/TikTok Shop.
	host := strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
	allowedImageDomains := []string{
		"ibyteimg.com",
		"ibytedtos.com",
		"byteimg.com",
		"byteoversea.com",
	}
	allowed := false
	for _, domain := range allowedImageDomains {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			allowed = true
			break
		}
	}
	if !allowed {
		return ""
	}

	return parsed.String()
}

func fetchTikTokOEmbed(ctx context.Context, videoURL string) (string, error) {
	endpoint := "https://www.tiktok.com/oembed?url=" + url.QueryEscape(videoURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; AffiliatePreview/1.0)")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 7 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("TikTok oEmbed merespons HTTP %d", resp.StatusCode)
	}

	var metadata tikTokOEmbedResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1024*1024)).Decode(&metadata); err != nil {
		return "", fmt.Errorf("respons oEmbed tidak valid: %w", err)
	}
	imageURL := strings.TrimSpace(metadata.ThumbnailURL)
	if imageURL == "" {
		return "", fmt.Errorf("thumbnail tidak tersedia dari oEmbed")
	}
	parsed, err := url.Parse(imageURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Scheme != "https" {
		return "", fmt.Errorf("URL thumbnail dari oEmbed tidak valid")
	}
	return parsed.String(), nil
}

func isTikTokHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "tiktok.com" || strings.HasSuffix(host, ".tiktok.com")
}

func isAllowedAffiliateHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	allowedDomains := []string{
		"tiktok.com",
		"tiktokshop.com",
		"tiktokglobalshop.com",
		"tokopedia.com",
		"shopee.co.id",
		"shopee.com",
		"lazada.co.id",
		"lazada.com",
	}
	for _, domain := range allowedDomains {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return true
		}
	}
	return false
}

func validateAffiliateURL(u *url.URL) error {
	if u == nil || u.User != nil {
		return fmt.Errorf("URL tidak valid")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("URL harus menggunakan HTTP atau HTTPS")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "" {
		return fmt.Errorf("host URL tidak ditemukan")
	}
	if !isAllowedAffiliateHost(host) {
		return fmt.Errorf("domain affiliate belum didukung: " + host)
	}
	port := u.Port()
	if port != "" && port != "80" && port != "443" {
		return fmt.Errorf("port URL tidak diizinkan")
	}
	if net.ParseIP(host) != nil {
		return fmt.Errorf("URL berbasis alamat IP tidak diizinkan")
	}

	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("domain tidak dapat diperiksa")
	}
	for _, ip := range ips {
		addr, ok := netip.AddrFromSlice(ip)
		if !ok {
			return fmt.Errorf("alamat domain tidak valid")
		}
		addr = addr.Unmap()
		if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsUnspecified() {
			return fmt.Errorf("domain mengarah ke alamat yang tidak diizinkan")
		}
	}
	return nil
}

func extractImageURL(body []byte, pageURL *url.URL) (string, error) {
	document, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return "", fmt.Errorf("gagal membaca HTML")
	}

	// Urutan prioritas: Open Graph/Twitter, JSON-LD atau JSON tertanam,
	// lalu tag gambar HTML. Halaman Tokopedia tertentu merender data produk
	// dari JSON, bukan dari meta og:image.
	var metadataCandidates []string
	var embeddedJSONCandidates []string
	var imageTagCandidates []string

	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch node.Data {
			case "meta":
				var property, name, content string
				for _, attr := range node.Attr {
					switch strings.ToLower(attr.Key) {
					case "property":
						property = strings.ToLower(strings.TrimSpace(attr.Val))
					case "name":
						name = strings.ToLower(strings.TrimSpace(attr.Val))
					case "content":
						content = strings.TrimSpace(attr.Val)
					}
				}
				if content != "" && (property == "og:image" || property == "og:image:url" || name == "twitter:image" || name == "twitter:image:src") {
					metadataCandidates = append(metadataCandidates, content)
				}

			case "link":
				var rel, href string
				for _, attr := range node.Attr {
					switch strings.ToLower(attr.Key) {
					case "rel":
						rel = strings.ToLower(strings.TrimSpace(attr.Val))
					case "href":
						href = strings.TrimSpace(attr.Val)
					}
				}
				if href != "" && (rel == "image_src" || rel == "preload") {
					metadataCandidates = append(metadataCandidates, href)
				}

			case "img":
				// Cadangan terakhir: beberapa halaman produk tidak menyediakan
				// metadata, tetapi memiliki gambar langsung pada elemen img.
				for _, attr := range node.Attr {
					key := strings.ToLower(attr.Key)
					value := strings.TrimSpace(attr.Val)
					if value == "" || strings.HasPrefix(value, "data:") {
						continue
					}
					if key == "src" || key == "data-src" || key == "data-original" {
						imageTagCandidates = append(imageTagCandidates, value)
					}
				}

			case "script":
				var scriptType, scriptID string
				for _, attr := range node.Attr {
					if strings.EqualFold(attr.Key, "type") {
						scriptType = strings.ToLower(strings.TrimSpace(attr.Val))
					}
					if strings.EqualFold(attr.Key, "id") {
						scriptID = strings.ToLower(strings.TrimSpace(attr.Val))
					}
				}
				var raw strings.Builder
				for child := node.FirstChild; child != nil; child = child.NextSibling {
					if child.Type == html.TextNode {
						raw.WriteString(child.Data)
					}
				}
				scriptText := strings.TrimSpace(raw.String())
				if scriptText != "" && (strings.Contains(scriptType, "ld+json") || scriptType == "application/json" || scriptID == "__next_data__" || strings.HasPrefix(scriptText, "{") || strings.HasPrefix(scriptText, "[")) {
					embeddedJSONCandidates = append(embeddedJSONCandidates, findJSONImage(scriptText)...)
				}
			}
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(document)

	candidates := make([]string, 0, len(metadataCandidates)+len(embeddedJSONCandidates)+len(imageTagCandidates))
	candidates = append(candidates, metadataCandidates...)
	candidates = append(candidates, embeddedJSONCandidates...)
	candidates = append(candidates, imageTagCandidates...)

	for _, candidate := range candidates {
		candidate = strings.TrimSpace(strings.ReplaceAll(candidate, `\u002F`, "/"))
		candidate = strings.ReplaceAll(candidate, `\u0026`, "&")
		candidate = strings.ReplaceAll(candidate, `\/`, "/")
		if candidate == "" || strings.HasPrefix(candidate, "data:") || strings.HasPrefix(candidate, "blob:") {
			continue
		}
		parsed, parseErr := url.Parse(candidate)
		if parseErr != nil {
			continue
		}
		resolved := pageURL.ResolveReference(parsed)
		if (resolved.Scheme == "https" || resolved.Scheme == "http") && resolved.Host != "" && resolved.User == nil {
			// Hindari ikon kecil atau data URI bila halaman menyediakan kandidat
			// gambar lain. Validasi ukuran/isi gambar dilakukan browser saat preview.
			if strings.Contains(strings.ToLower(resolved.Path), ".svg") || strings.Contains(strings.ToLower(resolved.Path), "favicon") {
				continue
			}
			return resolved.String(), nil
		}
	}
	return "", fmt.Errorf("metadata atau elemen gambar tidak ditemukan pada halaman tujuan")
}

func findJSONImage(raw string) []string {
	var result []string
	var value any
	if json.Unmarshal([]byte(raw), &value) != nil {
		return result
	}
	var visit func(any)
	visit = func(v any) {
		switch item := v.(type) {
		case map[string]any:
			for key, child := range item {
				if strings.EqualFold(key, "image") || strings.EqualFold(key, "thumbnailUrl") || strings.EqualFold(key, "thumbnailURL") {
					result = appendJSONImage(result, child)
				} else {
					visit(child)
				}
			}
		case []any:
			for _, child := range item {
				visit(child)
			}
		}
	}
	visit(value)
	return result
}

func appendJSONImage(result []string, value any) []string {
	switch item := value.(type) {
	case string:
		return append(result, item)
	case []any:
		for _, child := range item {
			result = appendJSONImage(result, child)
		}
	case map[string]any:
		for key, child := range item {
			if strings.EqualFold(key, "url") || strings.EqualFold(key, "contentUrl") {
				result = appendJSONImage(result, child)
			}
		}
	}
	return result
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" || origin == "https://qeon-creative.vercel.app" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, statusCode int, payload APIResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("Gagal menulis respons JSON: %v", err)
	}
}
