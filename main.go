package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Position struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Player string  `json:"player"`
}

type State struct {
	Players map[string]Position `json:"players"`
}

type Client struct {
	conn *websocket.Conn
	send sync.Mutex
}

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			// Render serves the frontend and WebSocket from the same origin.
			// Keep cross-origin connections possible for local testing.
			return true
		},
	}
	mu        sync.Mutex
	clients   = map[string]*Client{}
	positions = map[string]Position{}
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/echo", handleWebSocket)
	mux.Handle("/", http.FileServer(http.Dir("public")))

	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("Server listening on :%s", port)
	log.Fatal(server.ListenAndServe())
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	id := uuid.NewString()
	client := &Client{conn: conn}

	mu.Lock()
	clients[id] = client
	positions[id] = Position{X: 400, Y: 300, Player: id}
	mu.Unlock()

	client.sendJSON(currentState())
	defer func() {
		mu.Lock()
		delete(clients, id)
		delete(positions, id)
		mu.Unlock()
		_ = conn.Close()
		broadcast()
	}()

	conn.SetReadLimit(16 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	})

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Method string  `json:"method"`
			X      float64 `json:"x"`
			Y      float64 `json:"y"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil || msg.Method != "update_position" {
			continue
		}
		mu.Lock()
		if _, exists := clients[id]; exists {
			positions[id] = Position{X: msg.X, Y: msg.Y, Player: id}
		}
		mu.Unlock()
		broadcast()
	}
}

func currentState() State {
	mu.Lock()
	defer mu.Unlock()
	players := make(map[string]Position, len(positions))
	for id, p := range positions {
		players[id] = p
	}
	return State{Players: players}
}

func (c *Client) sendJSON(v any) {
	c.send.Lock()
	defer c.send.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_ = c.conn.WriteJSON(v)
}

func broadcast() {
	state := currentState()
	mu.Lock()
	list := make([]*Client, 0, len(clients))
	for _, c := range clients {
		list = append(list, c)
	}
	mu.Unlock()
	for _, c := range list {
		c.sendJSON(state)
	}
}
