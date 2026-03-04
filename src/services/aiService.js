/**
 * AI SERVICE — OLLAMA LOCAL ENGINE
 * Pure offline AI using Ollama sidecar (Qwen 2.5 3B, 4-bit quantized)
 * Zero cloud dependencies, unlimited usage, no rate limits
 */

import { db, STORES } from "../db/database.js";
import { formatDate } from "../utils/formatting.js";

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const MODEL = 'qwen2.5:3b';

class AiService {
  constructor() {
    // Persistent Chat History from localStorage
    const savedHistory = localStorage.getItem('ai_chat_history');
    this.chatHistory = savedHistory ? JSON.parse(savedHistory) : [];
    
    this.pending = false;
    this.ollamaReady = false;
    this.onTokenCallbacks = [];
    
    // Listen for Ollama ready event (Electron mode)
    if (window.electronAPI?.ollama) {
      window.electronAPI.ollama.onReady(() => {
        this.ollamaReady = true;
        console.log('✅ Ollama AI is ready');
      });
      window.electronAPI.ollama.onError((msg) => {
        console.error('❌ Ollama error:', msg);
      });
      window.electronAPI.ollama.onStatusChange((status) => {
        this.ollamaReady = (status === 'ready');
        console.log(`📡 Ollama status changed: ${status}`);
        // Trigger a custom event for UI updates if needed
        window.dispatchEvent(new CustomEvent('ollama-status-update', { detail: status }));
      });
      // Check initial status
      window.electronAPI.ollama.getStatus().then(s => {
        this.ollamaReady = s.status === 'ready';
      });
    } else {
      // Browser dev mode: check directly
      this.checkOllamaDirectly();
    }
  }

  /**
   * For browser dev mode (npm run dev without Electron)
   */
  async checkOllamaDirectly() {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`);
      if (res.ok) this.ollamaReady = true;
    } catch {
      this.ollamaReady = false;
    }
  }

  /**
   * Subscribe to streaming tokens
   */
  onToken(callback) {
    this.onTokenCallbacks.push(callback);
    return () => {
      this.onTokenCallbacks = this.onTokenCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Emit a token to all subscribers
   */
  emitToken(token) {
    for (const cb of this.onTokenCallbacks) {
      try { cb(token); } catch { /* skip */ }
    }
  }

  /**
   * Load long-term memory (learned rules/preferences) from database
   */
  async loadPreferences() {
    try {
      const prefs = await db.get(STORES.SETTINGS, 'ai_learned_preferences');
      console.log("AI LTM Loaded:", prefs?.value);
      return Array.isArray(prefs?.value) ? prefs.value : [];
    } catch (err) {
      console.warn("Could not load AI preferences:", err);
      return [];
    }
  }

  /**
   * Analyze spreadsheet headers and suggest mapping to SCS schema
   */
  async analyzeColumns(headers, sampleRows) {
    const prompt = `
      You are an expert data clerk for a Student Collection System (SCS).
      I have a spreadsheet with these headers: ${JSON.stringify(headers)}
      Here are a few sample rows: ${JSON.stringify(sampleRows.slice(0, 3))}

      Task: Map these headers to the following SCS fields. If a field isn't present, return null for it.
      Return the mapping as a JSON object where the key is the SCS field and the value is the index of the header in the provided array.

      SCS Fields:
      - studentName: Full name of the student
      - studentId: Student matric number, ID, or IC
      - email: Contact email
      - phone: Contact number
      - course: Program group (e.g., Diploma, BBA, MBA)
      - intake: Intake session (e.g., Jan 2024)
      - totalFees: Total tuition fees
      - institutionalCost: Cost paid to the institution
      - registrationFee: Initial registration fee
      - commission: Agent/referral commission
      - amount: The specific payment amount in this row
      - paymentDate: When the payment was made
      - semester: Semester or year of study

      Output JSON format: 
      {
        "studentName": number | null,
        "studentId": number | null,
        ...
      }
    `;

    try {
      const text = await this.generateRaw(prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (error) {
      console.error("AI Analysis failed:", error);
      return null;
    }
  }

  /**
   * AI-Assisted Deep Scan — semantic column discovery.
   * Called when the deterministic processor has low confidence.
   * Analyzes actual cell content, not just headers.
   * @param {Array} rows - 2D array of spreadsheet rows
   * @returns {Object|null} - Proposed column mapping { field: colIndex }
   */
  async deepScanColumns(rows) {
    if (!rows || rows.length < 3) return null;

    // Build a column-content summary (first 10 non-empty values per column)
    const numCols = Math.max(...rows.map(r => r ? r.length : 0));
    const colSamples = [];

    for (let col = 0; col < Math.min(numCols, 20); col++) {
      const values = [];
      for (let row = 0; row < Math.min(rows.length, 15); row++) {
        const val = rows[row]?.[col];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          values.push(String(val).trim().substring(0, 50));
        }
        if (values.length >= 8) break;
      }
      if (values.length > 0) {
        colSamples.push({ col, samples: values });
      }
    }

    const prompt = `/no_think
Analyze these spreadsheet columns and map each to a field.

COLUMNS:
${colSamples.map(c => `Col ${c.col}: ${JSON.stringify(c.samples.slice(0, 5))}`).join('\n')}

FIELDS: name, intake, completionDate, program, studentId, commission, totalFees, registrationFee, semester

Map columns to fields. Commission cells may contain "NAME AMOUNT" like "PREMA 1000".
Dates may be "Oct-22", "10/22", "2022". Fees are large RM amounts (>500).
Only map confident columns. Return ONLY JSON: {"fieldName": colIndex}`;

    try {
      const text = await this.generateRaw(prompt);
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const mapping = JSON.parse(jsonMatch[0]);
        console.log('🧠 AI Deep Scan mapping:', mapping);
        return mapping;
      }
    } catch (error) {
      console.error('AI Deep Scan failed:', error);
    }
    return null;
  }

  /**
   * Raw text generation (non-streaming, for column analysis etc.)
   */
  async generateRaw(prompt) {
    // Electron mode: use IPC
    if (window.electronAPI?.ollama) {
      const result = await window.electronAPI.ollama.generate(prompt);
      if (result.success) return result.response;
      throw new Error(result.error);
    }
    
    // Browser dev mode: direct HTTP
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.2, num_predict: 2048, num_ctx: 4096 } })
    });
    const data = await res.json();
    return data.response || '';
  }

  /**
   * Chat with streaming — the main conversation method
   */
  async getInsights(query, dataContext, attachment = null) {
    if (this.pending) {
      return "I'm still processing your previous request. Please wait a moment.";
    }
    
    if (!this.ollamaReady) {
      return "🧠 The AI engine is still loading. Please wait a moment — it's warming up locally on your machine.";
    }
    
    this.pending = true;
    
    // Load Long-Term Memory (Permanent Rules)
    const learnedRules = await this.loadPreferences();
    const rulesPrompt = learnedRules.length > 0 
      ? `\n## LEARNED RULES (LONG-TERM MEMORY)\n${learnedRules.map(r => `- ${r}`).join('\n')}`
      : "";
    
    // Build system prompt — OPTIMIZED FOR SMALL LOCAL MODELS
    const systemPrompt = `You are "SCS Assistant". You help manage student records.

TODAY: ${formatDate(new Date(), 'long')}. Current year: ${new Date().getFullYear()}.

DATABASE:
${JSON.stringify(dataContext)}
${rulesPrompt}

YOU MUST FOLLOW THESE RULES. VIOLATIONS ARE UNACCEPTABLE:

1. NEVER show JSON, code, markdown code blocks, or technical syntax to the user. Talk like a human.
2. NEVER ask "would you like me to proceed?" or "shall I update?". When the user tells you to do something, DO IT IMMEDIATELY.
3. NEVER show examples of what you WILL do. Just do it.
4. When performing database actions, include hidden action blocks that the user cannot see.
5. Match the user's language (English, Chinese, Malay, etc).
6. Dates like "Oct-22" mean October 2022. "Mar-23" means March 2023. ALWAYS use 4-digit years.
7. If data is missing in the spreadsheet, leave the field unchanged. Do NOT guess.
8. SPREADSHEET RULE: You will NEVER receive messages about importing or uploading spreadsheets — the system handles those automatically with a Bridge Card. If somehow a spreadsheet question reaches you, just say: "Use the chat to send your import request and I'll prepare the Master Cleaning Prompt for Gemini." Never try to parse spreadsheet data yourself.

ACTION FORMAT (hidden from user):
To update students, include this EXACT format in your response:
:::ACTION_START:::{"action":"updateMany","payload":{"collection":"students","find":{"name":"STUDENT NAME"},"update":{"intake":"Oct 2022","completionDate":"Oct 2024"}}}:::ACTION_END:::

You can include multiple action blocks in one response. One block per student.

EXAMPLE GOOD RESPONSE when user says "update the intake years":
"Done! I've updated the intake and completion years for all students based on the spreadsheet data."
:::ACTION_START:::{"action":"updateMany","payload":{"collection":"students","find":{"name":"JOHN DOE"},"update":{"intake":"Oct 2022"}}}:::ACTION_END:::
:::ACTION_START:::{"action":"updateMany","payload":{"collection":"students","find":{"name":"JANE DOE"},"update":{"intake":"Mar 2023","completionDate":"Mar 2025"}}}:::ACTION_END:::

EXAMPLE BAD RESPONSE (NEVER DO THIS):
"Here's what I'll update: \`\`\`json { ... } \`\`\` Would you like me to proceed?"

OTHER ACTIONS:
- Theme: :::ACTION_START:::{"action":"set_theme","payload":{"theme":"dark"}}:::ACTION_END:::
- Save rule: :::ACTION_START:::{"action":"save_preference","payload":{"value":"always speak in malay"}}:::ACTION_END:::

REMEMBER: NO CODE. NO ASKING. JUST DO IT.`;

    // Build messages array for Ollama
    const messages = [];
    
    // Add recent chat history (last 20 entries)
    for (const entry of this.chatHistory) {
      messages.push({
        role: entry.role === 'model' ? 'assistant' : entry.role,
        content: entry.parts?.[0]?.text || entry.content || ''
      });
    }
    
    // Add the current user message
    let userContent = query;
    if (attachment) {
      userContent += `\n\n[User attached a file: ${attachment.mimeType}]`;
    }
    messages.push({ role: 'user', content: userContent });

    try {
      let fullResponse = '';

      // Electron mode: use IPC with streaming tokens
      if (window.electronAPI?.ollama) {
        // Set up token listener BEFORE sending
        const unsubscribe = window.electronAPI.ollama.onToken((token) => {
          this.emitToken(token);
        });
        
        const result = await window.electronAPI.ollama.chat(messages, systemPrompt);
        unsubscribe();
        
        if (!result.success) throw new Error(result.error);
        fullResponse = result.response;
      } else {
        // Browser dev mode: direct streaming HTTP
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true,
            options: { temperature: 0.4, num_predict: 2048, num_ctx: 4096 }
          })
        });
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                fullResponse += data.message.content;
                this.emitToken(data.message.content);
              }
            } catch { /* skip */ }
          }
        }
      }

      // Update and persist chat history
      this.chatHistory.push(
        { role: "user", parts: [{ text: query }] },
        { role: "model", parts: [{ text: fullResponse }] }
      );
      if (this.chatHistory.length > 20) {
        this.chatHistory = this.chatHistory.slice(-20);
      }
      localStorage.setItem('ai_chat_history', JSON.stringify(this.chatHistory));

      return fullResponse;
    } catch (error) {
      console.error("AI Insights failed:", error);
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch')) {
        return "🧠 The AI engine isn't running. Please make sure Ollama is installed and running.";
      }
      return "I encountered an error processing your request. Please try again.";
    } finally {
      this.pending = false;
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.chatHistory = [];
    localStorage.removeItem('ai_chat_history');
  }
}

export const aiService = new AiService();
