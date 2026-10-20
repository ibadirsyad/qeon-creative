package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Endpoint khusus Shopee.
// Handler lama /api/affiliate/preview-image tidak diubah.
func shopeePreviewImageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{
			Status: "error",
			Error:  "Gunakan metode GET",
		})
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Status: "error",
			Error:  "Parameter url wajib diisi",
		})
		return
	}

	target, err := url.Parse(rawURL)
	if err != nil || target.Host == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Status: "error",
			Error:  "URL Shopee tidak valid",
		})
		return
	}

	if err := validateAffiliateURL(target); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	if !isShopeeHost(target.Hostname()) {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Status: "error",
			Error:  "Endpoint ini hanya menerima link Shopee",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	client := &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 8 {
				return fmt.Errorf("terlalu banyak pengalihan link Shopee")
			}

			if err := validateAffiliateURL(req.URL); err != nil {
				return fmt.Errorf("pengalihan Shopee tidak diizinkan: %w", err)
			}

			return nil
		},
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		target.String(),
		nil,
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{
			Status: "error",
			Error:  "Tidak dapat membuat permintaan ke Shopee",
		})
		return
	}

	request.Header.Set(
		"User-Agent",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) "+
			"AppleWebKit/537.36 (KHTML, like Gecko) "+
			"Chrome/131.0.0.0 Safari/537.36",
	)
	request.Header.Set(
		"Accept",
		"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
	)
	request.Header.Set(
		"Accept-Language",
		"id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
	)
	request.Header.Set("Referer", "https://shopee.co.id/")

	response, err := client.Do(request)
	if err != nil {
		log.Printf(
			"[shopee-preview] gagal membuka link; host=%s error=%v",
			target.Hostname(),
			err,
		)

		writeJSON(w, http.StatusBadGateway, APIResponse{
			Status: "error",
			Error:  "Link Shopee tidak dapat dibaca oleh backend. Coba link produk lengkap atau unggah gambar manual.",
		})
		return
	}
	defer response.Body.Close()

	finalURL := response.Request.URL

	log.Printf(
		"[shopee-preview] redirect host=%s path=%s status=%d",
		finalURL.Hostname(),
		finalURL.Path,
		response.StatusCode,
	)

	if err := validateAffiliateURL(finalURL); err != nil {
		writeJSON(w, http.StatusBadGateway, APIResponse{
			Status: "error",
			Error:  "Link Shopee diarahkan ke domain yang tidak diizinkan",
		})
		return
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeJSON(w, http.StatusBadGateway, APIResponse{
			Status: "error",
			Error: fmt.Sprintf(
				"Halaman Shopee menolak permintaan (HTTP %d). Coba link produk langsung atau unggah gambar manual.",
				response.StatusCode,
			),
		})
		return
	}

	contentType := strings.ToLower(response.Header.Get("Content-Type"))

	if !strings.Contains(contentType, "text/html") &&
		!strings.Contains(contentType, "application/xhtml+xml") &&
		!strings.Contains(contentType, "application/json") {
		writeJSON(w, http.StatusUnsupportedMediaType, APIResponse{
			Status: "error",
			Error:  "Link Shopee tidak mengarah ke halaman produk yang bisa dibaca. Unggah gambar secara manual.",
		})
		return
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxHTMLSize+1))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, APIResponse{
			Status: "error",
			Error:  "Gagal membaca halaman Shopee",
		})
		return
	}

	if len(body) > maxHTMLSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, APIResponse{
			Status: "error",
			Error:  "Halaman Shopee terlalu besar untuk diproses",
		})
		return
	}

	// Ekstraksi utama: hanya menerima HTTPS dari CDN Shopee
	// dengan path /file/ agar aset halaman tidak dianggap gambar produk.
	if imageURL := extractShopeeCDNImage(body); imageURL != "" {
		writeJSON(w, http.StatusOK, APIResponse{
			Status:   "ok",
			Message:  "Gambar ditemukan dari CDN gambar Shopee",
			ImageURL: imageURL,
		})
		return
	}

	// Normalisasi encoding umum yang digunakan dalam HTML/JSON.
	diagnosticBody := normalizeShopeeHTML(string(body))
	lowerBody := strings.ToLower(diagnosticBody)
	marker := "cover"
	idx := strings.Index(lowerBody, marker)

	if idx >= 0 {
		start := idx - 300
		if start < 0 {
			start = 0
		}

		end := idx + 700
		if end > len(diagnosticBody) {
			end = len(diagnosticBody)
		}

		log.Printf(
			"[shopee-preview] cover context: %q",
			diagnosticBody[start:end],
		)
	}
	// Diagnostik terbatas: ambil konteks sekitar maksimal dua
	// kemunculan domain CDN. Tidak mencatat keseluruhan HTML.
	logShopeeCDNContext(diagnosticBody, 2)

	writeJSON(w, http.StatusUnprocessableEntity, APIResponse{
		Status: "error",
		Error: "URL gambar CDN Shopee tidak ditemukan pada halaman ini. " +
			"Periksa log diagnostik Railway. Jika URL gambar tidak tersedia " +
			"di HTML, coba link produk langsung atau unggah gambar manual.",
	})
}

func isShopeeHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))

	return host == "shopee.co.id" ||
		strings.HasSuffix(host, ".shopee.co.id") ||
		host == "shopee.com" ||
		strings.HasSuffix(host, ".shopee.com")
}

var shopeeImageURLPattern = regexp.MustCompile(
	`https?://[^"'\s<>]+`,
)

func normalizeShopeeHTML(value string) string {
	return strings.NewReplacer(
		`\u002F`, "/",
		`\u002f`, "/",
		`\/`, "/",
		`\u003A`, ":",
		`\u003a`, ":",
		`\u0026`, "&",
		`\u003D`, "=",
		`\u003d`, "=",
		`&amp;`, "&",
		`%3A`, ":",
		`%3a`, ":",
		`%2F`, "/",
		`%2f`, "/",
	).Replace(value)
}

func extractShopeeCDNImage(body []byte) string {
	raw := normalizeShopeeHTML(string(body))
	candidates := shopeeImageURLPattern.FindAllString(raw, -1)

	for _, candidate := range candidates {
		candidate = strings.TrimRight(candidate, `),;]}`)

		parsed, err := url.Parse(candidate)
		if err != nil ||
			parsed.Scheme != "https" ||
			parsed.User != nil {
			continue
		}

		host := strings.ToLower(
			strings.TrimSuffix(parsed.Hostname(), "."),
		)

		if host != "susercontent.com" &&
			!strings.HasSuffix(host, ".susercontent.com") {
			continue
		}

		if !strings.HasPrefix(parsed.Path, "/file/") {
			continue
		}

		return parsed.String()
	}

	return ""
}

func logShopeeCDNContext(body string, limit int) {
	lowerBody := strings.ToLower(body)
	marker := "susercontent.com"
	start := 0

	for i := 0; i < limit; i++ {
		idx := strings.Index(lowerBody[start:], marker)
		if idx < 0 {
			return
		}

		idx += start

		from := idx - 100
		if from < 0 {
			from = 0
		}

		to := idx + len(marker) + 150
		if to > len(body) {
			to = len(body)
		}

		// Potongan ini dapat memuat URL atau parameter halaman.
		// Jangan gunakan untuk mencatat seluruh HTML atau cookie.
		log.Printf(
			"[shopee-preview] CDN context %d: %q",
			i+1,
			body[from:to],
		)

		start = idx + len(marker)
		if start >= len(body) {
			return
		}
	}
}
