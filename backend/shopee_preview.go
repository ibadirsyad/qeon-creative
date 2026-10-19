package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// shopeePreviewImageHandler adalah endpoint khusus Shopee. Fungsi umum yang
// sudah ada di main.go (validateAffiliateURL, extractImageURL, writeJSON,
// APIResponse, maxHTMLSize) tetap digunakan; handler lama tidak diubah.
func shopeePreviewImageHandler(w http.ResponseWriter, r *http.Request) {
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
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "URL Shopee tidak valid"})
		return
	}
	if err := validateAffiliateURL(target); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: err.Error()})
		return
	}
	if !isShopeeHost(target.Hostname()) {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Endpoint ini hanya menerima link Shopee"})
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

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Status: "error", Error: "Tidak dapat membuat permintaan ke Shopee"})
		return
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	request.Header.Set("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8")
	request.Header.Set("Accept-Language", "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7")
	request.Header.Set("Referer", "https://shopee.co.id/")

	response, err := client.Do(request)
	if err != nil {
		log.Printf("[shopee-preview] gagal membuka link; host=%s error=%v", target.Hostname(), err)
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Link Shopee tidak dapat dibaca oleh backend. Coba link produk lengkap atau unggah gambar secara manual."})
		return
	}
	defer response.Body.Close()

	finalURL := response.Request.URL
	log.Printf("[shopee-preview] redirect host=%s path=%s status=%d", finalURL.Hostname(), finalURL.Path, response.StatusCode)
	if err := validateAffiliateURL(finalURL); err != nil {
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Link Shopee diarahkan ke domain yang tidak diizinkan"})
		return
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: fmt.Sprintf("Halaman Shopee menolak permintaan (HTTP %d). Coba link produk langsung atau unggah gambar manual.", response.StatusCode)})
		return
	}

	contentType := strings.ToLower(response.Header.Get("Content-Type"))
	if !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml+xml") {
		writeJSON(w, http.StatusUnsupportedMediaType, APIResponse{Status: "error", Error: "Link Shopee tidak mengarah ke halaman HTML yang bisa dibaca. Unggah gambar produk secara manual."})
		return
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxHTMLSize+1))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, APIResponse{Status: "error", Error: "Gagal membaca halaman Shopee"})
		return
	}
	if len(body) > maxHTMLSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, APIResponse{Status: "error", Error: "Halaman Shopee terlalu besar untuk diproses"})
		return
	}

	imageURL, err := extractImageURL(body, finalURL)
	if err != nil || strings.TrimSpace(imageURL) == "" {
		log.Printf("[shopee-preview] metadata gambar tidak ditemukan; host=%s content_type=%q bytes=%d", finalURL.Hostname(), contentType, len(body))
		writeJSON(w, http.StatusUnprocessableEntity, APIResponse{Status: "error", Error: "Shopee tidak memberikan metadata gambar yang bisa dibaca untuk link ini. Coba link produk lengkap atau unggah gambar produk secara manual."})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{Status: "ok", Message: "Gambar ditemukan dari metadata halaman Shopee", ImageURL: imageURL})
}

func isShopeeHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "shopee.co.id" || strings.HasSuffix(host, ".shopee.co.id") || host == "shopee.com" || strings.HasSuffix(host, ".shopee.com")
}
