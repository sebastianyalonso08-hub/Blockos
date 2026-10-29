package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAuditSignupThenCookieAndTokenSession(t *testing.T) {
	store = Store{Users: map[string]*User{}, Tables: map[string][]map[string]any{}, Sessions: map[string]string{}}
	dataDir := t.TempDir()
	t.Setenv("BLOCKOS_DATA_DIR", dataDir)
	dbPath = dataDir + "/blockos.json"
	signup := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"AuditPlayer","password":"password123"}`))
	signup.Header.Set("X-Forwarded-Proto", "https")
	w := httptest.NewRecorder()
	auth(w, signup)
	if w.Code != 201 {
		t.Fatalf("signup status %d: %s", w.Code, w.Body.String())
	}
	var result struct {
		User  map[string]any `json:"user"`
		Token string         `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Token == "" {
		t.Fatal("no token")
	}
	cookie := w.Result().Cookies()[0]
	for _, tc := range []struct {
		name   string
		cookie bool
		token  bool
	}{{"cookie", true, false}, {"token", false, true}, {"both", true, true}} {
		req := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
		if tc.cookie {
			req.AddCookie(cookie)
		}
		if tc.token {
			req.Header.Set("X-Blockos-Session", result.Token)
		}
		rw := httptest.NewRecorder()
		auth(rw, req)
		if rw.Code != 200 || !strings.Contains(rw.Body.String(), "AuditPlayer") {
			t.Errorf("%s session failed: %d %s", tc.name, rw.Code, rw.Body.String())
		}
	}
	// Simulate process restart while data file is preserved.
	oldStore := store
	if err := persist(); err != nil {
		t.Fatal(err)
	}
	store = Store{}
	load()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	req.AddCookie(cookie)
	req.Header.Set("X-Blockos-Session", result.Token)
	rw := httptest.NewRecorder()
	auth(rw, req)
	if !strings.Contains(rw.Body.String(), "AuditPlayer") {
		t.Errorf("persisted session failed after reload: %s", rw.Body.String())
	}
	store = oldStore
}
