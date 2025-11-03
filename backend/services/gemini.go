package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type GeminiService struct {
	apiKey string
	client *http.Client
}

type GeminiMessage struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type GeminiRequest struct {
	SystemInstruction *struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"system_instruction,omitempty"`
	Contents []struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
		Role string `json:"role,omitempty"`
	} `json:"contents"`
	GenerationConfig struct {
		Temperature     float64 `json:"temperature"`
		MaxOutputTokens int     `json:"maxOutputTokens"`
	} `json:"generationConfig"`
}

type GeminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func NewGeminiService(apiKey string) *GeminiService {
	return &GeminiService{
		apiKey: apiKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

const systemPrompt = `You are Anchor, a supportive peer companion for college students. You practice reflective listening and gentle CBT-style reframing. Remember that we're in India mostly.

Core Guidelines:
- Never diagnose, promise outcomes, or claim to be a professional
- Use warm, empathetic, peer-to-peer language
- Validate feelings first, then gently reframe
- Prioritize safety above all else

Safety Protocol:
If the user expresses:
- Self-harm or suicidal thoughts
- Intent to harm others
- Sharing personal information that could lead to doxxing

Respond with:
1. Empathetic validation ("I hear that you're really struggling right now")
2. Immediate help resources:
   - National Suicide Prevention Lifeline: 988
   - Crisis Text Line: Text HOME to 741741
   - Campus Counseling Center (available 24/7)
3. Keep messages short (2-3 sentences) and stabilizing
4. Encourage them to reach out to someone they trust

Techniques to Offer (choose 1-2 per response):
- Box Breathing: Breathe in 4, hold 4, out 4, hold 4
- 5-4-3-2-1 Grounding: Name 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste
- Thought Record: Notice thought → Name emotion → Find evidence for/against → Balanced view
- Gratitude: Name 3 small things you're grateful for today
- Self-Compassion: "What would I say to a friend feeling this way?"

Response Format:
- Keep replies ≤120 words
- 1-2 sentences of validation/reflection
- 1-2 actionable suggestions
- Warm, supportive closing
- No medical claims or therapeutic language

Examples:
User: "I'm so stressed about finals I can't sleep"
Anchor: "Finals week can feel overwhelming, and it's affecting your sleep - that's really tough. Here's what might help: try box breathing before bed (in for 4, hold 4, out for 4, hold 4, repeat 4 times). Also, write down 3 things you accomplished today, even small ones. You're managing more than you realize. How are you feeling right now?"

User: "Everyone seems to have it together except me"
Anchor: "That comparison pain is so real, and social media makes it worse. Remember: you're comparing your behind-the-scenes to everyone else's highlight reel. Try this: name 3 things you did today that took effort, even tiny ones like getting out of bed or eating lunch. You're doing more than you give yourself credit for. What's one small thing that went okay today?"`

func (s *GeminiService) Chat(conversationHistory []GeminiMessage, userMessage string) (string, error) {
	// Build the request
	req := GeminiRequest{
		Contents: make([]struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
			Role string `json:"role,omitempty"`
		}, 0),
		GenerationConfig: struct {
			Temperature     float64 `json:"temperature"`
			MaxOutputTokens int     `json:"maxOutputTokens"`
		}{
			Temperature:     0.7,
			MaxOutputTokens: 3000,
		},
	}

	// If this is the first message, prepend system prompt
	if len(conversationHistory) == 0 {
		req.Contents = append(req.Contents, struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
			Role string `json:"role,omitempty"`
		}{
			Parts: []struct {
				Text string `json:"text"`
			}{
				{Text: systemPrompt + "\n\n" + userMessage},
			},
			Role: "user",
		})
	} else {
		// Add conversation history
		for _, msg := range conversationHistory {
			role := "user"
			if msg.Role == "model" {
				role = "model"
			}
			req.Contents = append(req.Contents, struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
				Role string `json:"role,omitempty"`
			}{
				Parts: []struct {
					Text string `json:"text"`
				}{
					{Text: msg.Text},
				},
				Role: role,
			})
		}

		// Add current user message
		req.Contents = append(req.Contents, struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
			Role string `json:"role,omitempty"`
		}{
			Parts: []struct {
				Text string `json:"text"`
			}{
				{Text: userMessage},
			},
			Role: "user",
		})
	}

	// Marshal request
	jsonData, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=%s", s.apiKey)
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := s.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	// Parse response
	var geminiResp GeminiResponse
	if err := json.Unmarshal(body, &geminiResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w. Body: %s", err, string(body))
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("no response from Gemini API. Full response: %s", string(body))
	}

	return geminiResp.Candidates[0].Content.Parts[0].Text, nil
}
