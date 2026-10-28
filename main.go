package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" { port = "10000" }
	root := "public"
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return
		}
		p := filepath.Clean("/" + r.URL.Path)
		if strings.Contains(p, "..") { http.NotFound(w,r); return }
		if p == "/" { p = "/index.html" }
		full := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(p, "/")))
		info, err := os.Stat(full)
		if err != nil || info.IsDir() { http.NotFound(w,r); return }
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w,r,full)
	})
	log.Printf("Blockos Ville listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
