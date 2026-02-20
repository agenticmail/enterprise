package services

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// APIURL is the base URL for the AgenticMail backend API.
var APIURL = "http://localhost:3000"

// APICall makes an HTTP request to the AgenticMail API and returns the JSON response.
func APICall(path, method, token string, body interface{}) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, APIURL+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}
