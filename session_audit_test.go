package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

func TestAuditSignupThenCookieAndTokenSession(t *testing.T) {
	store = Store{Users: map[string]*User{}, Tables: map[string][]map[string]any{}, Sessions: map[string]string{}}
	dataDir := t.TempDir()
	t.Setenv("BLOCKOS_DATA_DIR", dataDir)
	load()
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

func TestAuditPurchaseAppearsInInventoryAndOwnedResponse(t *testing.T) {
	store = Store{Users: map[string]*User{}, Tables: map[string][]map[string]any{}, Sessions: map[string]string{}}
	dir := t.TempDir()
	t.Setenv("BLOCKOS_DATA_DIR", dir)
	load()
	signup := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"BuyerAudit","password":"password123"}`))
	signup.Header.Set("X-Forwarded-Proto", "https")
	signupW := httptest.NewRecorder()
	auth(signupW, signup)
	if signupW.Code != http.StatusCreated {
		t.Fatalf("signup: %d %s", signupW.Code, signupW.Body.String())
	}
	var created struct {
		User  map[string]any `json:"user"`
		Token string         `json:"token"`
	}
	if err := json.Unmarshal(signupW.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	id := created.User["id"].(string)
	buyReq := httptest.NewRequest(http.MethodPost, "/api/rpc/purchase_catalog_item", strings.NewReader(`{"p_item_id":"face-smile"}`))
	buyReq.Header.Set("X-Blockos-Session", created.Token)
	buyW := httptest.NewRecorder()
	rpcAPI(buyW, buyReq)
	if buyW.Code != http.StatusOK || !strings.Contains(buyW.Body.String(), `"purchased"`) {
		t.Fatalf("purchase: %d %s", buyW.Code, buyW.Body.String())
	}
	invReq := httptest.NewRequest(http.MethodGet, "/api/data/inventory?select=item_id&user_id=eq."+id, nil)
	invReq.Header.Set("X-Blockos-Session", created.Token)
	invW := httptest.NewRecorder()
	dataAPI(invW, invReq)
	if invW.Code != http.StatusOK || !strings.Contains(invW.Body.String(), `"item_id":"face-smile"`) {
		t.Fatalf("inventory after purchase: %d %s", invW.Code, invW.Body.String())
	}
	buyAgain := httptest.NewRequest(http.MethodPost, "/api/rpc/purchase_catalog_item", strings.NewReader(`{"p_item_id":"face-smile"}`))
	buyAgain.Header.Set("X-Blockos-Session", created.Token)
	buyAgainW := httptest.NewRecorder()
	rpcAPI(buyAgainW, buyAgain)
	if buyAgainW.Code != http.StatusOK || !strings.Contains(buyAgainW.Body.String(), `"owned"`) {
		t.Fatalf("owned response: %d %s", buyAgainW.Code, buyAgainW.Body.String())
	}
}

func TestSequentialFourDigitIDsAndFreshDatabase(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BLOCKOS_DATA_DIR", dir)
	load()
	if len(store.Users) != 0 {
		t.Fatalf("fresh database should be empty, got %d users", len(store.Users))
	}
	for i, username := range []string{"FirstPlayer", "SecondPlayer", "ThirdPlayer"} {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"`+username+`","password":"password123"}`))
		rw := httptest.NewRecorder()
		auth(rw, req)
		if rw.Code != http.StatusCreated {
			t.Fatalf("signup %s: %d %s", username, rw.Code, rw.Body.String())
		}
		var got struct {
			User map[string]any `json:"user"`
		}
		if err := json.Unmarshal(rw.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		want := []string{"0001", "0002", "0003"}[i]
		if got.User["id"] != want {
			t.Fatalf("%s got ID %v, want %s", username, got.User["id"], want)
		}
	}
	// A new process must continue from the persisted counter, not start over.
	store = Store{}
	load()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"FourthPlayer","password":"password123"}`))
	rw := httptest.NewRecorder()
	auth(rw, req)
	var got struct {
		User map[string]any `json:"user"`
	}
	if err := json.Unmarshal(rw.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.User["id"] != "0004" {
		t.Fatalf("after reload got ID %v, want 0004", got.User["id"])
	}
}

func TestSessionCookieCannotBeForgedWithAccountID(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BLOCKOS_DATA_DIR", dir)
	load()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"CookiePlayer","password":"password123"}`))
	rw := httptest.NewRecorder()
	auth(rw, req)
	cookie := rw.Result().Cookies()[0]
	if cookie.Value == "0001" {
		t.Fatal("session cookie must be a secret token, not the public account ID")
	}
	forged := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	forged.AddCookie(&http.Cookie{Name: "bv_session", Value: "0001"})
	fw := httptest.NewRecorder()
	auth(fw, forged)
	if strings.Contains(fw.Body.String(), "CookiePlayer") {
		t.Fatalf("public account ID authenticated as cookie: %s", fw.Body.String())
	}
	valid := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	valid.AddCookie(cookie)
	vw := httptest.NewRecorder()
	auth(vw, valid)
	if !strings.Contains(vw.Body.String(), "CookiePlayer") {
		t.Fatalf("valid cookie failed: %s", vw.Body.String())
	}
}

func TestLegacyDatabaseIsNotImported(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(dir+"/blockos.json", []byte(`{"users":{"legacy":{"id":"legacy","username":"LegacyPlayer"}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BLOCKOS_DATA_DIR", dir)
	load()
	if len(store.Users) != 0 {
		t.Fatalf("legacy accounts were imported into the new database: %#v", store.Users)
	}
}

func TestConcurrentSignupsReceiveUniqueSequentialIDs(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BLOCKOS_DATA_DIR", dir)
	load()
	const count = 12
	ids := make(chan string, count)
	errs := make(chan string, count)
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			name := fmt.Sprintf("Concurrent%02d", i)
			req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"`+name+`","password":"password123"}`))
			rw := httptest.NewRecorder()
			auth(rw, req)
			if rw.Code != http.StatusCreated {
				errs <- fmt.Sprintf("%s: %d %s", name, rw.Code, rw.Body.String())
				return
			}
			var result struct {
				User map[string]any `json:"user"`
			}
			if err := json.Unmarshal(rw.Body.Bytes(), &result); err != nil {
				errs <- err.Error()
				return
			}
			ids <- result.User["id"].(string)
		}(i)
	}
	wg.Wait()
	close(ids)
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	seen := map[string]bool{}
	for id := range ids {
		if seen[id] {
			t.Errorf("duplicate account ID %s", id)
		}
		seen[id] = true
	}
	if len(seen) != count {
		t.Fatalf("got %d unique IDs, want %d", len(seen), count)
	}
	for i := 1; i <= count; i++ {
		id := fmt.Sprintf("%04d", i)
		if !seen[id] {
			t.Errorf("missing sequential ID %s", id)
		}
	}
}

func auditCreateUser(t *testing.T, username string) (string, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"username":"`+username+`","password":"password123"}`))
	rw := httptest.NewRecorder()
	auth(rw, req)
	if rw.Code != http.StatusCreated {
		t.Fatalf("signup %s: %d %s", username, rw.Code, rw.Body.String())
	}
	var got struct {
		User  map[string]any `json:"user"`
		Token string         `json:"token"`
	}
	if err := json.Unmarshal(rw.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return got.User["id"].(string), got.Token
}

func TestProfileDescriptionPersistsAndFriendsRequestsWork(t *testing.T) {
	t.Setenv("BLOCKOS_DATA_DIR", t.TempDir())
	load()
	firstID, firstToken := auditCreateUser(t, "ProfileOwner")
	secondID, secondToken := auditCreateUser(t, "FriendTarget")

	patch := httptest.NewRequest(http.MethodPatch, "/api/data/profiles?id=eq."+firstID, strings.NewReader(`{"description":"Hello Blockos Ville"}`))
	patch.Header.Set("X-Blockos-Session", firstToken)
	patchW := httptest.NewRecorder()
	dataAPI(patchW, patch)
	if patchW.Code != http.StatusOK {
		t.Fatalf("profile update: %d %s", patchW.Code, patchW.Body.String())
	}
	get := httptest.NewRequest(http.MethodGet, "/api/data/profiles?id=eq."+firstID, nil)
	get.Header.Set("X-Blockos-Session", firstToken)
	getW := httptest.NewRecorder()
	dataAPI(getW, get)
	if !strings.Contains(getW.Body.String(), "Hello Blockos Ville") {
		t.Fatalf("description not returned: %s", getW.Body.String())
	}

	request := httptest.NewRequest(http.MethodPost, "/api/data/friend_requests", strings.NewReader(`{"receiver_id":"`+secondID+`"}`))
	request.Header.Set("X-Blockos-Session", firstToken)
	requestW := httptest.NewRecorder()
	dataAPI(requestW, request)
	if requestW.Code != http.StatusCreated {
		t.Fatalf("friend request create: %d %s", requestW.Code, requestW.Body.String())
	}
	incoming := httptest.NewRequest(http.MethodGet, "/api/data/friend_requests?or=sender_id.eq."+firstID+",receiver_id.eq."+firstID, nil)
	incoming.Header.Set("X-Blockos-Session", secondToken)
	incomingW := httptest.NewRecorder()
	dataAPI(incomingW, incoming)
	if incomingW.Code != http.StatusOK || !strings.Contains(incomingW.Body.String(), firstID) {
		t.Fatalf("friend request not visible to receiver: %d %s", incomingW.Code, incomingW.Body.String())
	}
	var response struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(incomingW.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data) != 1 {
		t.Fatalf("receiver should see one incoming request, got %d", len(response.Data))
	}
	requestID := response.Data[0]["id"].(string)
	accept := httptest.NewRequest(http.MethodPatch, "/api/data/friend_requests?id=eq."+requestID+"&receiver_id=eq."+secondID, strings.NewReader(`{"status":"accepted"}`))
	accept.Header.Set("X-Blockos-Session", secondToken)
	acceptW := httptest.NewRecorder()
	dataAPI(acceptW, accept)
	if acceptW.Code != http.StatusOK || !strings.Contains(acceptW.Body.String(), "accepted") {
		t.Fatalf("friend request accept: %d %s", acceptW.Code, acceptW.Body.String())
	}
}

func TestCatalogItemsExistAndUnknownItemsCannotBePurchased(t *testing.T) {
	t.Setenv("BLOCKOS_DATA_DIR", t.TempDir())
	load()
	_, token := auditCreateUser(t, "CatalogTester")
	list := httptest.NewRequest(http.MethodGet, "/api/data/catalog_items?select=*", nil)
	list.Header.Set("X-Blockos-Session", token)
	listW := httptest.NewRecorder()
	dataAPI(listW, list)
	if listW.Code != http.StatusOK || !strings.Contains(listW.Body.String(), "face-smile") {
		t.Fatalf("catalog missing built-in items: %d %s", listW.Code, listW.Body.String())
	}
	bad := httptest.NewRequest(http.MethodPost, "/api/rpc/purchase_catalog_item", strings.NewReader(`{"p_item_id":"not-a-real-item"}`))
	bad.Header.Set("X-Blockos-Session", token)
	badW := httptest.NewRecorder()
	rpcAPI(badW, bad)
	if badW.Code != http.StatusNotFound {
		t.Fatalf("unknown item purchase should fail, got %d %s", badW.Code, badW.Body.String())
	}
}

func TestFreeCatalogItemCanBeBoughtAndEquippedForAvatar(t *testing.T) {
	t.Setenv("BLOCKOS_DATA_DIR", t.TempDir())
	load()
	userID, token := auditCreateUser(t, "AvatarTester")
	buy := httptest.NewRequest(http.MethodPost, "/api/rpc/purchase_catalog_item", strings.NewReader(`{"p_item_id":"face-smile"}`))
	buy.Header.Set("X-Blockos-Session", token)
	buyW := httptest.NewRecorder()
	rpcAPI(buyW, buy)
	if buyW.Code != http.StatusOK {
		t.Fatalf("buy free face: %d %s", buyW.Code, buyW.Body.String())
	}
	equip := httptest.NewRequest(http.MethodPost, "/api/rpc/equip_catalog_item", strings.NewReader(`{"p_item_id":"face-smile"}`))
	equip.Header.Set("X-Blockos-Session", token)
	equipW := httptest.NewRecorder()
	rpcAPI(equipW, equip)
	if equipW.Code != http.StatusOK {
		t.Fatalf("equip face: %d %s", equipW.Code, equipW.Body.String())
	}
	wardrobe := httptest.NewRequest(http.MethodGet, "/api/data/inventory?user_id=eq."+userID, nil)
	wardrobe.Header.Set("X-Blockos-Session", token)
	wardrobeW := httptest.NewRecorder()
	dataAPI(wardrobeW, wardrobe)
	if !strings.Contains(wardrobeW.Body.String(), "face-smile") {
		t.Fatalf("wardrobe missing purchased face: %s", wardrobeW.Body.String())
	}
	outfit := httptest.NewRequest(http.MethodGet, "/api/data/avatar_equipped?user_id=eq."+userID, nil)
	outfit.Header.Set("X-Blockos-Session", token)
	outfitW := httptest.NewRecorder()
	dataAPI(outfitW, outfit)
	if !strings.Contains(outfitW.Body.String(), `"category":"face"`) {
		t.Fatalf("avatar outfit missing equipped face: %s", outfitW.Body.String())
	}
}
