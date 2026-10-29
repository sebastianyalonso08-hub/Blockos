package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type User struct {
	ID           string            `json:"id"`
	Username     string            `json:"username"`
	PasswordHash string            `json:"-"`
	Salt         string            `json:"-"`
	CreatedAt    string            `json:"created_at"`
	Description  string            `json:"description"`
	BodyColors   map[string]string `json:"body_colors"`
	Coins        int               `json:"coins"`
}
type Store struct {
	Users      map[string]*User            `json:"users"`
	Tables     map[string][]map[string]any `json:"tables"`
	Sessions   map[string]string           `json:"sessions,omitempty"`
	NextUserID int                         `json:"next_user_id"`
}

var mu sync.Mutex
var store Store
var dbPath string

func randomHex(n int) string {
	b := make([]byte, n)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func hashPass(p, s string) string {
	h := []byte(s + p)
	for i := 0; i < 120000; i++ {
		x := sha256.Sum256(h)
		h = x[:]
	}
	return hex.EncodeToString(h)
}
func persist() error {
	b, e := json.MarshalIndent(store, "", "  ")
	if e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Dir(dbPath), 0755); e != nil {
		return e
	}
	tmp := dbPath + ".tmp"
	if e = os.WriteFile(tmp, b, 0600); e != nil {
		return e
	}
	return os.Rename(tmp, dbPath)
}
func load() {
	base := os.Getenv("BLOCKOS_DATA_DIR")
	if base == "" {
		if _, e := os.Stat("/var/data"); e == nil {
			base = "/var/data"
		} else {
			base = "data"
		}
	}
	// This is a deliberately new database namespace. The previous blockos.json is
	// never opened or imported, so the new account registry starts empty.
	dbPath = filepath.Join(base, "blockos-accounts-v2.json")
	store = Store{Users: map[string]*User{}, Tables: map[string][]map[string]any{}, Sessions: map[string]string{}, NextUserID: 1}
	b, e := os.ReadFile(dbPath)
	if e == nil {
		_ = json.Unmarshal(b, &store)
	}
	if store.Users == nil {
		store.Users = map[string]*User{}
	}
	if store.Tables == nil {
		store.Tables = map[string][]map[string]any{}
	}
	if store.Sessions == nil {
		store.Sessions = map[string]string{}
	}
	// Recover the allocator from the highest issued numeric ID if the field is
	// absent (for example, when loading an early v2 database). Never decrement it.
	maxID := 0
	for id := range store.Users {
		if n, err := strconv.Atoi(id); err == nil && n > maxID {
			maxID = n
		}
	}
	if store.NextUserID <= maxID {
		store.NextUserID = maxID + 1
	}
	if store.NextUserID < 1 {
		store.NextUserID = 1
	}
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func body(r *http.Request) map[string]any {
	var v map[string]any
	_ = json.NewDecoder(r.Body).Decode(&v)
	return v
}
func cookieUser(r *http.Request) *User {
	// Prefer the persistent HttpOnly cookie when it exists.
	if c, err := r.Cookie("bv_session"); err == nil && c.Value != "" {
		if id, ok := store.Sessions[c.Value]; ok {
			if u := store.Users[id]; u != nil {
				return u
			}
		}
	}
	// Always check the server-issued token too, including when the cookie is
	// missing. Returning early on a missing cookie used to bypass this fallback
	// and made a refresh/navigation look like a logout in some deployments.
	token := r.Header.Get("X-Blockos-Session")
	if token != "" && store.Sessions != nil {
		if id, ok := store.Sessions[token]; ok {
			return store.Users[id]
		}
	}
	return nil
}
func setSessionCookie(w http.ResponseWriter, r *http.Request, value string, maxAge int) {
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{Name: "bv_session", Value: value, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}
func publicUser(u *User) map[string]any {
	return map[string]any{"id": u.ID, "username": u.Username, "created_at": u.CreatedAt, "description": u.Description, "body_colors": u.BodyColors, "coins": u.Coins, "user_metadata": map[string]any{"username": u.Username}, "email": strings.ToLower(u.Username) + "@accounts.blockosville.invalid"}
}
func auth(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	switch r.URL.Path {
	case "/api/auth/session":
		w.Header().Set("Cache-Control", "no-store")
		u := cookieUser(r)
		if u == nil {
			writeJSON(w, 200, map[string]any{"user": nil})
			return
		}
		writeJSON(w, 200, map[string]any{"user": publicUser(u)})
	case "/api/auth/signup":
		if r.Method != "POST" {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
			return
		}
		b := body(r)
		name := strings.TrimSpace(fmt.Sprint(b["username"]))
		pass := fmt.Sprint(b["password"])
		if len(name) < 3 || len(name) > 20 {
			writeJSON(w, 400, map[string]string{"error": "Username must be 3–20 characters."})
			return
		}
		for _, c := range name {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_') {
				writeJSON(w, 400, map[string]string{"error": "Use only letters, numbers and underscores in your username."})
				return
			}
		}
		if len(pass) < 8 {
			writeJSON(w, 400, map[string]string{"error": "Password must be at least 8 characters."})
			return
		}
		for _, u := range store.Users {
			if strings.EqualFold(u.Username, name) {
				writeJSON(w, 409, map[string]string{"error": "That username is already taken."})
				return
			}
		}
		if store.NextUserID > 9999 {
			writeJSON(w, 409, map[string]string{"error": "The four-digit account ID range is full."})
			return
		}
		id := fmt.Sprintf("%04d", store.NextUserID)
		store.NextUserID++
		salt := randomHex(16)
		u := &User{ID: id, Username: name, Salt: salt, PasswordHash: hashPass(pass, salt), CreatedAt: time.Now().UTC().Format(time.RFC3339), BodyColors: map[string]string{"head": "#ffcc33", "torso": "#1479bd", "leftArm": "#ffcc33", "rightArm": "#ffcc33", "leftLeg": "#39834b", "rightLeg": "#39834b"}, Coins: 0}
		store.Users[id] = u
		store.Tables["profiles"] = append(store.Tables["profiles"], map[string]any{"id": id, "username": name, "created_at": u.CreatedAt, "description": "", "body_colors": u.BodyColors, "coins": 0})
		token := randomHex(32)
		store.Sessions[token] = id
		if err := persist(); err != nil {
			delete(store.Users, id)
			delete(store.Sessions, token)
			store.Tables["profiles"] = store.Tables["profiles"][:len(store.Tables["profiles"])-1]
			store.NextUserID--
			writeJSON(w, 500, map[string]string{"error": "Could not save the new account. Please try again."})
			return
		}
		setSessionCookie(w, r, token, 2592000)
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 201, map[string]any{"user": publicUser(u), "token": token})
	case "/api/auth/login":
		if r.Method != "POST" {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
			return
		}
		b := body(r)
		name := strings.TrimSpace(fmt.Sprint(b["username"]))
		pass := fmt.Sprint(b["password"])
		for _, u := range store.Users {
			if strings.EqualFold(u.Username, name) && u.PasswordHash == hashPass(pass, u.Salt) {
				token := randomHex(32)
				store.Sessions[token] = u.ID
				if err := persist(); err != nil {
					delete(store.Sessions, token)
					writeJSON(w, 500, map[string]string{"error": "Could not save the login session."})
					return
				}
				setSessionCookie(w, r, token, 2592000)
				w.Header().Set("Cache-Control", "no-store")
				writeJSON(w, 200, map[string]any{"user": publicUser(u), "token": token})
				return
			}
		}
		writeJSON(w, 401, map[string]string{"error": "Login failed. Check your username and password."})
	case "/api/auth/logout":
		token := r.Header.Get("X-Blockos-Session")
		if token == "" {
			if c, err := r.Cookie("bv_session"); err == nil {
				token = c.Value
			}
		}
		if token != "" {
			delete(store.Sessions, token)
			_ = persist()
		}
		setSessionCookie(w, r, "", -1)
		writeJSON(w, 200, map[string]any{"ok": true})
	default:
		writeJSON(w, 404, map[string]string{"error": "Not found"})
	}
}
func dataAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "POST" && r.Method != "PATCH" && r.Method != "DELETE" {
		writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
		return
	}
	table := strings.TrimPrefix(r.URL.Path, "/api/data/")
	if table == "" || strings.Contains(table, "/") {
		writeJSON(w, 404, map[string]string{"error": "Unknown table"})
		return
	}
	mu.Lock()
	defer mu.Unlock()
	u := cookieUser(r)
	if u == nil {
		writeJSON(w, 401, map[string]string{"error": "Please log in first."})
		return
	}
	rows := store.Tables[table]
	q := r.URL.Query()
	matches := func(row map[string]any) bool {
		for k, vals := range q {
			if k == "select" || k == "order" || k == "limit" || k == "or" {
				continue
			}
			if len(vals) == 0 {
				continue
			}
			v := vals[0]
			if strings.HasPrefix(v, "eq.") && fmt.Sprint(row[k]) != strings.TrimPrefix(v, "eq.") {
				return false
			}
			if strings.HasPrefix(v, "ilike.") && !strings.Contains(strings.ToLower(fmt.Sprint(row[k])), strings.ToLower(strings.Trim(strings.TrimPrefix(v, "ilike."), "%"))) {
				return false
			}
		}
		if raw := q.Get("or"); raw != "" {
			ok := false
			for _, clause := range strings.Split(raw, ",") {
				parts := strings.SplitN(clause, ".", 2)
				if len(parts) == 2 && strings.HasPrefix(parts[1], "eq.") && fmt.Sprint(row[parts[0]]) == strings.TrimPrefix(parts[1], "eq.") {
					ok = true
					break
				}
			}
			if !ok {
				return false
			}
		}
		return true
	}
	if r.Method == "POST" {
		var arr []map[string]any
		var one map[string]any
		raw := body(r)
		if v, ok := raw["rows"].([]any); ok {
			for _, x := range v {
				if m, ok := x.(map[string]any); ok {
					arr = append(arr, m)
				}
			}
		} else {
			one = raw
			arr = []map[string]any{one}
		}
		for _, row := range arr {
			if row == nil {
				writeJSON(w, 400, map[string]string{"error": "Invalid request body."})
				return
			}
			if table == "friend_requests" {
				receiver := fmt.Sprint(row["receiver_id"])
				if receiver == u.ID || receiver == "<nil>" {
					writeJSON(w, 400, map[string]string{"error": "Invalid friend request recipient."})
					return
				}
				exists := false
				for _, target := range store.Users {
					if target.ID == receiver {
						exists = true
						break
					}
				}
				if !exists {
					writeJSON(w, 404, map[string]string{"error": "Player not found."})
					return
				}
				for _, existing := range rows {
					if fmt.Sprint(existing["sender_id"]) == u.ID && fmt.Sprint(existing["receiver_id"]) == fmt.Sprint(row["receiver_id"]) && fmt.Sprint(existing["status"]) == "pending" {
						writeJSON(w, 409, map[string]string{"error": "A friend request already exists."})
						return
					}
				}
				row["sender_id"] = u.ID
				row["status"] = "pending"
			}
			if row["id"] == nil {
				row["id"] = randomHex(12)
			}
			if row["created_at"] == nil {
				row["created_at"] = time.Now().UTC().Format(time.RFC3339)
			}
			if table == "profiles" {
				row["id"] = u.ID
				row["username"] = u.Username
				row["coins"] = u.Coins
			}
			// Never trust a client-supplied owner ID.
			row["user_id"] = u.ID
			rows = append(rows, row)
		}
		store.Tables[table] = rows
		_ = persist()
		writeJSON(w, 201, map[string]any{"data": arr})
		return
	}
	if r.Method == "PATCH" || r.Method == "DELETE" {
		payload := body(r)
		if table == "friend_requests" && r.Method == "PATCH" {
			status := fmt.Sprint(payload["status"])
			if status != "accepted" && status != "rejected" {
				writeJSON(w, 400, map[string]string{"error": "Invalid friend request status."})
				return
			}
		}
		out := []map[string]any{}
		kept := []map[string]any{}
		for _, row := range rows {
			owned := row["user_id"] != nil && fmt.Sprint(row["user_id"]) == u.ID
			if table == "friend_requests" {
				owned = fmt.Sprint(row["receiver_id"]) == u.ID
			}
			if matches(row) && (owned || (table == "profiles" && fmt.Sprint(row["id"]) == u.ID)) {
				if r.Method == "PATCH" {
					for k, v := range payload {
						if k == "id" || k == "user_id" || k == "sender_id" || k == "receiver_id" || k == "created_at" {
							continue
						}
						row[k] = v
					}
					kept = append(kept, row)
					out = append(out, row)
				}
			} else {
				kept = append(kept, row)
			}
		}
		store.Tables[table] = kept
		if table == "profiles" {
			for k, v := range payload {
				if k == "description" {
					u.Description = fmt.Sprint(v)
				}
				if k == "body_colors" {
					if m, ok := v.(map[string]any); ok {
						u.BodyColors = map[string]string{}
						for ck, cv := range m {
							u.BodyColors[ck] = fmt.Sprint(cv)
						}
					}
				}
				if k == "coins" {
					if n, ok := v.(float64); ok {
						u.Coins = int(n)
					}
				}
			}
		}
		_ = persist()
		writeJSON(w, 200, map[string]any{"data": out})
		return
	}
	out := []map[string]any{}
	for _, row := range rows {
		visible := false
		switch table {
		case "profiles", "catalog_items", "forum_posts", "avatar_equipped":
			visible = true
		case "friend_requests":
			visible = fmt.Sprint(row["sender_id"]) == u.ID || fmt.Sprint(row["receiver_id"]) == u.ID
		default:
			visible = fmt.Sprint(row["user_id"]) == u.ID
		}
		if matches(row) && visible {
			copyRow := map[string]any{}
			for k, v := range row {
				copyRow[k] = v
			}
			if table == "friend_requests" {
				for _, profile := range store.Tables["profiles"] {
					if fmt.Sprint(profile["id"]) == fmt.Sprint(row["sender_id"]) {
						copyRow["sender"] = map[string]any{"id": profile["id"], "username": profile["username"]}
					}
					if fmt.Sprint(profile["id"]) == fmt.Sprint(row["receiver_id"]) {
						copyRow["receiver"] = map[string]any{"id": profile["id"], "username": profile["username"]}
					}
				}
			}
			out = append(out, copyRow)
		}
	}
	// Apply the PostgREST-like ordering and limit options used by the frontend.
	if order := q.Get("order"); order != "" {
		parts := strings.Split(order, ".")
		field := parts[0]
		desc := len(parts) > 1 && parts[1] == "desc"
		sort.SliceStable(out, func(i, j int) bool {
			a, b := fmt.Sprint(out[i][field]), fmt.Sprint(out[j][field])
			if desc {
				return a > b
			}
			return a < b
		})
	}
	if rawLimit := q.Get("limit"); rawLimit != "" {
		if limit, err := strconv.Atoi(rawLimit); err == nil && limit >= 0 && len(out) > limit {
			out = out[:limit]
		}
	}
	writeJSON(w, 200, map[string]any{"data": out})
}
func main() {
	load()
	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("/api/auth/", auth)
	mux.HandleFunc("/api/data/", dataAPI)
	mux.HandleFunc("/api/rpc/", rpcAPI)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", 405)
			return
		}
		p := filepath.Clean("/" + r.URL.Path)
		if strings.Contains(p, "..") {
			http.NotFound(w, r)
			return
		}
		if p == "/" {
			p = "/index.html"
		}
		full := filepath.Join("public", filepath.FromSlash(strings.TrimPrefix(p, "/")))
		info, e := os.Stat(full)
		if e != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, full)
	})
	log.Printf("Blockos Ville listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func rpcAPI(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	u := cookieUser(r)
	if u == nil {
		writeJSON(w, 401, map[string]string{"error": "Please log in first."})
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/rpc/")
	b := body(r)
	item := fmt.Sprint(b["p_item_id"])
	if name == "purchase_catalog_item" {
		for _, row := range store.Tables["inventory"] {
			if fmt.Sprint(row["user_id"]) == u.ID && fmt.Sprint(row["item_id"]) == item {
				writeJSON(w, 200, map[string]any{"data": "owned"})
				return
			}
		}
		var price int
		for _, row := range store.Tables["catalog_items"] {
			if fmt.Sprint(row["id"]) == item {
				price, _ = row["price"].(int)
				if f, ok := row["price"].(float64); ok {
					price = int(f)
				}
				break
			}
		}
		if u.Coins < price {
			writeJSON(w, 400, map[string]string{"error": "You do not have enough Blockos Coins."})
			return
		}
		u.Coins -= price
		store.Tables["inventory"] = append(store.Tables["inventory"], map[string]any{"id": randomHex(12), "user_id": u.ID, "item_id": item, "created_at": time.Now().UTC().Format(time.RFC3339)})
		for _, p := range store.Tables["profiles"] {
			if fmt.Sprint(p["id"]) == u.ID {
				p["coins"] = u.Coins
			}
		}
		_ = persist()
		writeJSON(w, 200, map[string]any{"data": "purchased"})
		return
	}
	if name == "equip_catalog_item" {
		owned := false
		for _, row := range store.Tables["inventory"] {
			if fmt.Sprint(row["user_id"]) == u.ID && fmt.Sprint(row["item_id"]) == item {
				owned = true
			}
		}
		if !owned {
			writeJSON(w, 400, map[string]string{"error": "You must own this item first."})
			return
		}
		category := "item"
		for _, row := range store.Tables["catalog_items"] {
			if fmt.Sprint(row["id"]) == item {
				category = fmt.Sprint(row["category"])
				break
			}
		}
		rows := []map[string]any{}
		for _, row := range store.Tables["avatar_equipped"] {
			if fmt.Sprint(row["user_id"]) != u.ID || fmt.Sprint(row["category"]) != category {
				rows = append(rows, row)
			}
		}
		rows = append(rows, map[string]any{"id": randomHex(12), "user_id": u.ID, "item_id": item, "category": category})
		store.Tables["avatar_equipped"] = rows
		_ = persist()
		writeJSON(w, 200, map[string]any{"data": "equipped"})
		return
	}
	writeJSON(w, 404, map[string]string{"error": "Unknown action"})
}
