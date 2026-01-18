import React, { useState, useRef, useEffect, useCallback } from 'react';
import { storage, autoSaveContent, autoSaveChatHistory, autoSavePreferences, versioning } from '../lib/storage';

const SAMPLE_TEXT = `Paste your chapter content here to begin editing...

The Words of Plainness Editorial Canvas is designed to help you refine your ministry writings with precision and care. Simply replace this text with your content and select an editorial focus area to begin.`;

const EDITORIAL_MODES = [
  { id: 'clarity', name: 'Clarity & Accessibility', icon: '◎', description: 'Making theological concepts accessible to interfaith audiences' },
  { id: 'grammar', name: 'Grammar & Style', icon: '¶', description: 'Polish language, syntax, and flow' },
  { id: 'tone', name: 'Tone Consistency', icon: '♫', description: 'Balance scholarly depth with pastoral warmth' },
  { id: 'scripture', name: 'Scripture References', icon: '✝', description: 'Verify and enhance scriptural citations' },
  { id: 'terminology', name: 'Church Style Guide', icon: '⚙', description: 'Align with current LDS terminology guidelines' },
];

const getModeColor = (modeId) => {
  const colors = {
    clarity: '#2563eb',
    grammar: '#7c3aed',
    tone: '#059669',
    scripture: '#b45309',
    terminology: '#dc2626'
  };
  return colors[modeId] || '#64748b';
};

const getModePrompt = (modeId) => {
  const prompts = {
    clarity: `Focus on CLARITY & ACCESSIBILITY for interfaith audiences. Identify phrases that:
- Use insider religious jargon that non-LDS readers may not understand
- Have complex theological concepts that could be simplified
- Assume prior knowledge of LDS doctrine or scripture
- Could be rephrased for broader Christian or interfaith comprehension
Suggest alternatives that preserve doctrinal accuracy while improving accessibility.`,
    
    grammar: `Focus on GRAMMAR & STYLE. Identify:
- Grammatical errors or awkward constructions
- Overly long or convoluted sentences
- Passive voice that could be active
- Repetitive word choices
- Flow and rhythm improvements
Suggest polished alternatives that enhance readability.`,
    
    tone: `Focus on TONE CONSISTENCY, balancing scholarly depth with pastoral warmth. Identify phrases that:
- Sound overly academic or cold for devotional writing
- Are too casual for the scholarly nature of the work
- Could better blend intellectual rigor with spiritual invitation
- Need adjustment to speak both to the mind and heart
Suggest alternatives that achieve the balance of a thoughtful minister-scholar.`,
    
    scripture: `Focus on SCRIPTURE REFERENCES. Identify:
- Scripture citations that could be added to support claims
- Existing references that may need verification
- Opportunities to connect to additional scriptural witnesses
- Places where cross-references would strengthen the argument
Suggest specific verse additions or reference improvements.`,
    
    terminology: `Focus on CHURCH STYLE GUIDE alignment (per the August 2018 guidelines). Identify:
- "Mormon" that should be "Latter-day Saint" (except in proper nouns like Book of Mormon)
- "LDS Church" that should be "The Church of Jesus Christ of Latter-day Saints" or "the Church" on subsequent references
- "Mormonism" that should be "the restored gospel of Jesus Christ" or similar
- Other terminology that doesn't align with current Church communication guidelines
Suggest corrections that align with the current style guide.`
  };
  return prompts[modeId] || '';
};

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: `Welcome to your Words of Plainness Editorial Canvas, Aaron. I'm here to help you refine your ministry writings.

**First-pass preparation:** When you paste new content, click "Prepare Document" to automatically:
• Convert footnotes to MLA inline citations
• Align terminology with the Church Style Guide (August 2018)

After preparation, select editorial focus areas and click "Analyze" for nuanced suggestions. Your work auto-saves continuously.`
};

const PREPARATION_SYSTEM_PROMPT = `You are an expert editorial assistant preparing a document for further editing. Your task is to make two specific transformations to the text:

## TASK 1: Convert Footnotes to MLA Inline Citations

Find all footnotes, endnotes, or numbered references and convert them to MLA inline citation format.

**Footnote patterns to find:**
- Superscript numbers: ¹ ² ³ or [1] [2] [3]
- Footnote markers like * † ‡
- References at the bottom of sections or end of document

**MLA inline citation format:**
- Books: (Author's Last Name page#) → (Smith 45)
- Articles: (Author's Last Name) → (Johnson)
- Scripture: (Book chapter:verse) → (John 3:16)
- Multiple authors: (Smith and Jones 23) or (Smith et al. 45)
- No author: (Shortened Title page#) → ("Mormon Doctrine" 112)

**Rules:**
- Place citation immediately after the quoted or referenced material
- Place citation before the period for sentences
- If footnote contains full bibliographic info, extract just author/page for inline
- If footnote is explanatory (not a citation), integrate it as a parenthetical note or brief aside

## TASK 2: Church Style Guide Terminology Alignment (August 2018)

Replace terminology to align with current Church communication guidelines:

**MUST change:**
- "Mormon" (as noun for members) → "Latter-day Saint" or "member of The Church of Jesus Christ of Latter-day Saints"
- "Mormons" → "Latter-day Saints" or "members of the Church"
- "Mormon Church" → "The Church of Jesus Christ of Latter-day Saints" (first reference) or "the Church" (subsequent)
- "LDS Church" → "The Church of Jesus Christ of Latter-day Saints" or "the Church"
- "Mormonism" → "the restored gospel of Jesus Christ" or "the restored gospel"
- "Mormon faith" → "the faith of Latter-day Saints" or "the restored gospel"
- "Mormon beliefs" → "Latter-day Saint beliefs" or "the teachings of the restored gospel"
- "Mormon Christianity" → "Latter-day Saint Christianity" or "the Christianity of the Restoration"

**DO NOT change:**
- "Book of Mormon" (proper noun - keep as is)
- "Mormon Tabernacle Choir" → now "The Tabernacle Choir at Temple Square" (update if encountered)
- Historical quotes where "Mormon" was the original term (preserve in quotations)
- Academic or historical contexts discussing the term itself

## OUTPUT FORMAT

Return ONLY the transformed text with no additional commentary, explanations, or markdown formatting. The output should be the complete document with all transformations applied, ready for further editing.

If there are no footnotes to convert, still apply the terminology changes.
If there are no terminology issues, still return the text (with any footnote conversions).`;

const prepareDocument = async (text, onProgress) => {
  // Split into paragraphs and process in chunks to avoid timeout
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;
  const MAX_WORDS_PER_CHUNK = 1500;
  
  // Group paragraphs into chunks
  for (const para of paragraphs) {
    const paraWords = para.trim().split(/\s+/).length;
    if (currentWordCount + paraWords > MAX_WORDS_PER_CHUNK && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [para];
      currentWordCount = paraWords;
    } else {
      currentChunk.push(para);
      currentWordCount += paraWords;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }
  
  // If only one chunk, process normally
  if (chunks.length === 1) {
    onProgress?.('Processing document...');
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        system: PREPARATION_SYSTEM_PROMPT,
        messages: [{ 
          role: 'user', 
          content: `Please prepare this document by converting footnotes to MLA inline citations and aligning terminology with the Church Style Guide:\n\n${text}` 
        }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.content.map(item => item.text || '').join('').trim();
  }
  
  // Process multiple chunks
  const processedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Processing section ${i + 1} of ${chunks.length}...`);
    
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 6000,
        system: PREPARATION_SYSTEM_PROMPT,
        messages: [{ 
          role: 'user', 
          content: `Please prepare this section of a longer document. Convert footnotes to MLA inline citations and align terminology with the Church Style Guide. Return ONLY the transformed text:\n\n${chunks[i]}` 
        }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status} on section ${i + 1}`);
    }
    
    const data = await response.json();
    const processedText = data.content.map(item => item.text || '').join('').trim();
    processedChunks.push(processedText);
  }
  
  return processedChunks.join('\n\n');
};

export default function Editor() {
  // Load initial state from storage
  const [content, setContent] = useState(() => {
    const saved = storage.loadContent();
    return saved || SAMPLE_TEXT;
  });
  
  const [suggestions, setSuggestions] = useState([]);
  
  const [activeModes, setActiveModes] = useState(() => {
    const prefs = storage.loadPreferences();
    return prefs?.activeModes || ['clarity'];
  });
  
  const [chatHistory, setChatHistory] = useState(() => {
    const saved = storage.loadChatHistory();
    return saved || [WELCOME_MESSAGE];
  });
  
  const [chatInput, setChatInput] = useState('');
  const [hoveredSuggestion, setHoveredSuggestion] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showVersionMenu, setShowVersionMenu] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [versions, setVersions] = useState(() => versioning.getVersions());
  const [isPreparing, setIsPreparing] = useState(false);
  const [showPrepareConfirm, setShowPrepareConfirm] = useState(false);
  const [suggestionLimit, setSuggestionLimit] = useState('8');
  const [expandedSuggestion, setExpandedSuggestion] = useState(null);
  
  const editorRef = useRef(null);
  const chatEndRef = useRef(null);

  // Word count
  useEffect(() => {
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    setWordCount(words.length);
  }, [content]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Auto-save content
  useEffect(() => {
    if (content !== SAMPLE_TEXT) {
      setSaveStatus('saving');
      autoSaveContent(content);
      const timer = setTimeout(() => setSaveStatus('saved'), 2500);
      return () => clearTimeout(timer);
    }
  }, [content]);

  // Auto-save chat history
  useEffect(() => {
    autoSaveChatHistory(chatHistory);
  }, [chatHistory]);

  // Auto-save preferences
  useEffect(() => {
    autoSavePreferences({ activeModes });
  }, [activeModes]);

  const toggleMode = (modeId) => {
    setActiveModes(prev => 
      prev.includes(modeId) 
        ? prev.filter(m => m !== modeId)
        : [...prev, modeId]
    );
  };

  const handlePrepareDocument = async () => {
    if (!content.trim() || content === SAMPLE_TEXT) {
      setError('Please paste your chapter content before preparing.');
      return;
    }
    
    setShowPrepareConfirm(false);
    setIsPreparing(true);
    setError(null);
    
    // Save current version before transforming
    versioning.saveVersion(content, 'Before preparation');
    setVersions(versioning.getVersions());
    
    setChatHistory(prev => [...prev, {
      role: 'assistant',
      content: '⏳ Preparing document: Converting footnotes to MLA inline citations and aligning terminology with Church Style Guide...'
    }]);

    try {
      const preparedText = await prepareDocument(content, (progressMsg) => {
        // Update the last chat message with progress
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = {
            role: 'assistant',
            content: `⏳ ${progressMsg}`
          };
          return newHistory;
        });
      });
      setContent(preparedText);
      setSuggestions([]);
      
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `✓ Document prepared successfully!\n\n**Changes applied:**\n• Footnotes converted to MLA inline citations\n• Terminology aligned with Church Style Guide (August 2018)\n\nA backup of your original text was saved to version history. You can now proceed with editorial analysis using the focus areas above.`
      }]);
      
    } catch (err) {
      console.error('Preparation error:', err);
      setError(`Document preparation failed: ${err.message}`);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `I encountered an issue during preparation: ${err.message}\n\nYour original text is unchanged. Would you like to try again?`
      }]);
    } finally {
      setIsPreparing(false);
    }
  };

  const callClaudeAPI = async (messages, systemPrompt) => {
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content.map(item => item.text || '').join('\n');
  };

  const analyzeContent = async () => {
    if (!content.trim() || content === SAMPLE_TEXT) {
      setError('Please paste your chapter content before analyzing.');
      return;
    }
    
    setIsAnalyzing(true);
    setError(null);
    setSuggestions([]);

    const modeDescriptions = activeModes.map(m => getModePrompt(m)).join('\n\n');
    
    const systemPrompt = `You are an expert editorial assistant helping Aaron refine his religious ministry writings for "Words of Plainness." Aaron is a retired science teacher, ordained Elder, and minister who bridges scientific understanding with spiritual insight. His writing serves both Latter-day Saint audiences and interfaith readers.

Your task is to analyze the provided text and return editorial suggestions.

${modeDescriptions}

Return approximately ${suggestionLimit === 'exhaustive' ? '25-40' : suggestionLimit} suggestions as a JSON array. Each suggestion must have this structure:
{
  "original": "exact text from document",
  "suggestion": "proposed replacement",
  "reason": "brief explanation",
  "mode": "clarity|grammar|tone|scripture|terminology"
}

IMPORTANT RULES:
1. Return ONLY a valid JSON array - no other text, no markdown, no code blocks
2. The "original" field must match the document EXACTLY
3. Keep all string values on a single line (no line breaks inside strings)
4. Escape any quotes inside strings with backslash

Example response format:
[{"original":"text here","suggestion":"new text","reason":"why","mode":"clarity"}]`;

    try {
      const response = await callClaudeAPI(
        [{ role: 'user', content: `Analyze this text and return suggestions as a JSON array:\n\n${content}` }],
        systemPrompt
      );

      // Extract JSON array - find first [ and last ]
      const startBracket = response.indexOf('[');
      const endBracket = response.lastIndexOf(']');
      
      if (startBracket === -1 || endBracket === -1) {
        const preview = response.substring(0, 300).replace(/\n/g, ' ');
        throw new Error(`No JSON array found. Response was: "${preview}..."`);
      }
      
      let jsonString = response.substring(startBracket, endBracket + 1);
      
      // Clean up common issues
      jsonString = jsonString.replace(/[\x00-\x1F\x7F]/g, ' ');
      
      let parsedSuggestions;
      try {
        parsedSuggestions = JSON.parse(jsonString);
      } catch (parseError) {
        const preview = jsonString.substring(0, 300).replace(/\n/g, ' ');
        throw new Error(`JSON parse failed: ${parseError.message}. JSON started with: "${preview}..."`);
      }
      
      // Process suggestions to add IDs and find positions
      const processedSuggestions = parsedSuggestions
        .map((s, idx) => {
          const start = content.indexOf(s.original);
          if (start === -1) return null;
          return {
            id: idx + 1,
            original: s.original,
            suggestion: s.suggestion,
            reason: s.reason,
            mode: s.mode,
            start: start,
            end: start + s.original.length
          };
        })
        .filter(s => s !== null);

      setSuggestions(processedSuggestions);
      
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: processedSuggestions.length > 0 
          ? `Analysis complete. I found ${processedSuggestions.length} suggestion${processedSuggestions.length !== 1 ? 's' : ''} based on your selected editorial focus areas.\n\nReview them in the margin—hover over highlighted text to see the connection. Accept or dismiss each as you see fit.`
          : `Analysis complete. The text looks strong for your selected focus areas.\n\nWould you like to try different focus areas, or discuss specific aspects of the writing?`
      }]);

    } catch (err) {
      console.error('Analysis error:', err);
      setError(`Analysis failed: ${err.message}`);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `I encountered an issue during analysis: ${err.message}`
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const acceptSuggestion = (suggestion) => {
    const newContent = content.substring(0, suggestion.start) + 
                       suggestion.suggestion + 
                       content.substring(suggestion.end);
    setContent(newContent);
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    
    setChatHistory(prev => [...prev, {
      role: 'assistant',
      content: `✓ Applied: "${suggestion.original.substring(0, 50)}${suggestion.original.length > 50 ? '...' : ''}" → "${suggestion.suggestion.substring(0, 50)}${suggestion.suggestion.length > 50 ? '...' : ''}"`
    }]);
  };

  const dismissSuggestion = (suggestion) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    setChatHistory(prev => [...prev, {
      role: 'assistant',
      content: `Dismissed suggestion. Your original phrasing preserved.`
    }]);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    const systemPrompt = `You are an editorial collaborator helping Aaron refine his religious ministry writings for "Words of Plainness."

Context about Aaron:
- Retired high school science teacher with 26 years experience
- Ordained Elder in the Melchizedek Priesthood
- Full-time RV traveling minister providing interfaith dialogue
- Combines scientific background with spiritual insight

The current document being edited:
"""
${content.substring(0, 3000)}${content.length > 3000 ? '...[truncated]' : ''}
"""

Current suggestions pending: ${suggestions.length}

Be conversational, warm, and collaborative. Offer specific editorial guidance when asked.`;

    const conversationMessages = chatHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));
    
    conversationMessages.push({ role: 'user', content: userMessage });

    try {
      const response = await callClaudeAPI(conversationMessages, systemPrompt);
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: `I had trouble processing that request: ${err.message}`
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const saveVersion = () => {
    const label = prompt('Version label (optional):', `Version ${versions.length + 1}`);
    if (label !== null) {
      const newVersion = versioning.saveVersion(content, label);
      if (newVersion) {
        setVersions(versioning.getVersions());
        setChatHistory(prev => [...prev, {
          role: 'assistant',
          content: `✓ Saved version: "${newVersion.label}" (${newVersion.wordCount} words)`
        }]);
      }
    }
  };

  const restoreVersion = (id) => {
    const restored = versioning.restoreVersion(id);
    if (restored) {
      setContent(restored);
      setSuggestions([]);
      setShowVersionMenu(false);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: '✓ Version restored.'
      }]);
    }
  };

  const startNewDocument = () => {
    if (content !== SAMPLE_TEXT && content.trim()) {
      const confirmClear = window.confirm(
        'Start a new document? Your current work will be saved to version history.'
      );
      if (!confirmClear) return;
      
      versioning.saveVersion(content, 'Auto-save before new document');
      setVersions(versioning.getVersions());
    }
    
    setContent(SAMPLE_TEXT);
    setSuggestions([]);
    setChatHistory([WELCOME_MESSAGE]);
    setError(null);
    storage.saveContent('');
    storage.saveChatHistory([WELCOME_MESSAGE]);
  };

  const exportContent = async (format) => {
    setShowExportMenu(false);
    
    if (format === 'docx' || format === 'gdocs') {
      const escapeRtf = (text) => {
        return text
          .replace(/\\/g, '\\\\')
          .replace(/\{/g, '\\{')
          .replace(/\}/g, '\\}')
          .replace(/\n/g, '\\par\n');
      };
      
      const lines = content.split('\n');
      let rtfBody = '';
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          rtfBody += `{\\pard\\sb400\\sa200\\b\\fs36 ${escapeRtf(trimmed.substring(2))}\\b0\\par}\n`;
        } else if (trimmed.startsWith('## ')) {
          rtfBody += `{\\pard\\sb300\\sa150\\b\\fs28 ${escapeRtf(trimmed.substring(3))}\\b0\\par}\n`;
        } else if (trimmed.startsWith('### ')) {
          rtfBody += `{\\pard\\sb240\\sa120\\b\\fs24 ${escapeRtf(trimmed.substring(4))}\\b0\\par}\n`;
        } else if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          rtfBody += `{\\pard\\li720\\sa120 \\bullet  ${escapeRtf(trimmed.substring(2))}\\par}\n`;
        } else if (trimmed === '') {
          rtfBody += `{\\pard\\sa200\\par}\n`;
        } else {
          rtfBody += `{\\pard\\sa200\\sl360\\slmult1\\qj ${escapeRtf(line)}\\par}\n`;
        }
      });
      
      const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman Georgia;}{\\f1\\fswiss Arial;}}
{\\colortbl;\\red44\\green36\\blue22;}
\\paperw12240\\paperh15840
\\margl1440\\margr1440\\margt1440\\margb1440
\\f0\\fs24\\cf1
${rtfBody}
}`;
      
      const blob = new Blob([rtfContent], { type: 'application/rtf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'words-of-plainness-edited.rtf';
      a.click();
      URL.revokeObjectURL(url);
      
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: format === 'gdocs'
          ? '✓ RTF file created. Upload to Google Drive and open with Docs.'
          : '✓ RTF file created. Opens in Word, Pages, or LibreOffice.'
      }]);
      
    } else {
      let exportData = content;
      let mimeType = 'text/plain';
      let filename = `words-of-plainness-edited.${format}`;
      
      if (format === 'html') {
        const htmlContent = content
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) return `<h1>${trimmed.substring(2)}</h1>`;
            if (trimmed.startsWith('## ')) return `<h2>${trimmed.substring(3)}</h2>`;
            if (trimmed.startsWith('### ')) return `<h3>${trimmed.substring(4)}</h3>`;
            if (trimmed === '') return '';
            return `<p>${line}</p>`;
          })
          .filter(line => line !== '')
          .join('\n');
        
        exportData = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Words of Plainness</title>
  <style>
    body { font-family: Georgia, serif; max-width: 750px; margin: 60px auto; padding: 0 24px; line-height: 1.8; color: #2c2416; }
    h1, h2, h3 { font-weight: 600; margin-top: 1.5em; }
    p { margin-bottom: 1em; text-align: justify; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`;
        mimeType = 'text/html';
      }
      
      const blob = new Blob([exportData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const renderContentWithHighlights = () => {
    if (suggestions.length === 0) return content;
    
    let result = [];
    let lastIndex = 0;
    
    const sortedSuggestions = [...suggestions].sort((a, b) => a.start - b.start);
    
    sortedSuggestions.forEach((suggestion, idx) => {
      if (suggestion.start > lastIndex) {
        result.push(
          <span key={`text-${idx}`}>
            {content.substring(lastIndex, suggestion.start)}
          </span>
        );
      }
      
      result.push(
        <span
          key={`highlight-${suggestion.id}`}
          style={{
            backgroundColor: hoveredSuggestion === suggestion.id 
              ? `${getModeColor(suggestion.mode)}30` 
              : `${getModeColor(suggestion.mode)}15`,
            borderBottom: `2px solid ${getModeColor(suggestion.mode)}`,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            padding: '0 2px',
            borderRadius: '2px'
          }}
          onMouseEnter={() => setHoveredSuggestion(suggestion.id)}
          onMouseLeave={() => setHoveredSuggestion(null)}
        >
          {content.substring(suggestion.start, suggestion.end)}
        </span>
      );
      
      lastIndex = suggestion.end;
    });
    
    if (lastIndex < content.length) {
      result.push(
        <span key="text-end">
          {content.substring(lastIndex)}
        </span>
      );
    }
    
    return result;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf9f7 0%, #f5f3ef 50%, #ebe8e2 100%)',
      fontFamily: '"Source Serif 4", Georgia, serif',
      color: '#2c2416'
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'linear-gradient(180deg, rgba(250,249,247,0.98) 0%, rgba(250,249,247,0.95) 100%)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(44,36,22,0.08)',
        padding: '16px 32px'
      }}>
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(30,58,95,0.3)'
            }}>
              <span style={{ color: '#f5f3ef', fontSize: '18px', fontWeight: '600' }}>W</span>
            </div>
            <div>
              <h1 style={{
                fontSize: '20px',
                fontWeight: '600',
                margin: 0,
                letterSpacing: '-0.02em',
                color: '#1e3a5f'
              }}>
                Words of Plainness
              </h1>
              <p style={{
                fontSize: '12px',
                color: '#7a6f5f',
                margin: 0,
                fontFamily: '"Inter", system-ui, sans-serif',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Editorial Canvas
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{
              fontSize: '12px',
              color: saveStatus === 'saved' ? '#059669' : '#7a6f5f',
              fontFamily: '"Inter", system-ui, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                background: saveStatus === 'saved' ? '#059669' : '#f59e0b' 
              }} />
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
            
            <span style={{
              fontSize: '13px',
              color: '#7a6f5f',
              fontFamily: '"Inter", system-ui, sans-serif'
            }}>
              {wordCount.toLocaleString()} words
            </span>
            
            {/* New Document */}
            <button
              onClick={startNewDocument}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid rgba(44,36,22,0.2)',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: '"Inter", system-ui, sans-serif',
                cursor: 'pointer',
                color: '#2c2416'
              }}
            >
              + New
            </button>
            
            {/* Versions */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowVersionMenu(!showVersionMenu); setShowExportMenu(false); }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: '1px solid rgba(44,36,22,0.2)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  cursor: 'pointer',
                  color: '#2c2416'
                }}
              >
                Versions
              </button>
              {showVersionMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: '#fff',
                  border: '1px solid rgba(44,36,22,0.1)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  minWidth: '240px',
                  zIndex: 100
                }}>
                  <button
                    onClick={saveVersion}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(30,58,95,0.05)',
                      border: 'none',
                      borderBottom: '1px solid rgba(44,36,22,0.08)',
                      textAlign: 'left',
                      fontSize: '13px',
                      fontFamily: '"Inter", system-ui, sans-serif',
                      cursor: 'pointer',
                      color: '#1e3a5f',
                      fontWeight: '500'
                    }}
                  >
                    + Save Current Version
                  </button>
                  {versions.length === 0 ? (
                    <div style={{ padding: '16px', color: '#7a6f5f', fontSize: '12px', textAlign: 'center' }}>
                      No saved versions yet
                    </div>
                  ) : (
                    versions.map(v => (
                      <button
                        key={v.id}
                        onClick={() => restoreVersion(v.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '10px 16px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid rgba(44,36,22,0.05)',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontFamily: '"Inter", system-ui, sans-serif',
                          cursor: 'pointer',
                          color: '#2c2416'
                        }}
                      >
                        <div style={{ fontWeight: '500' }}>{v.label}</div>
                        <div style={{ color: '#7a6f5f', fontSize: '11px' }}>
                          {v.wordCount} words • {new Date(v.timestamp).toLocaleDateString()}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            
            {/* Export */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowExportMenu(!showExportMenu); setShowVersionMenu(false); }}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(44,36,22,0.2)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  cursor: 'pointer',
                  color: '#2c2416'
                }}
              >
                Export ↓
              </button>
              {showExportMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: '#fff',
                  border: '1px solid rgba(44,36,22,0.1)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  minWidth: '200px',
                  zIndex: 100
                }}>
                  {['docx', 'gdocs', 'txt', 'md', 'html'].map(format => (
                    <button
                      key={format}
                      onClick={() => exportContent(format)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 16px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(44,36,22,0.05)',
                        textAlign: 'left',
                        fontSize: '13px',
                        fontFamily: '"Inter", system-ui, sans-serif',
                        cursor: 'pointer',
                        color: '#2c2416'
                      }}
                    >
                      {format === 'docx' ? 'Word / RTF' : 
                       format === 'gdocs' ? 'Google Docs' : 
                       `.${format}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Mode Selector */}
      <div style={{
        background: 'rgba(255,255,255,0.6)',
        borderBottom: '1px solid rgba(44,36,22,0.06)',
        padding: '12px 32px'
      }}>
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <span style={{
            fontSize: '11px',
            color: '#7a6f5f',
            fontFamily: '"Inter", system-ui, sans-serif',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginRight: '8px'
          }}>
            Editorial Focus:
          </span>
          {EDITORIAL_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => toggleMode(mode.id)}
              title={mode.description}
              style={{
                padding: '6px 14px',
                background: activeModes.includes(mode.id) 
                  ? `${getModeColor(mode.id)}15`
                  : 'transparent',
                border: `1px solid ${activeModes.includes(mode.id) 
                  ? getModeColor(mode.id) 
                  : 'rgba(44,36,22,0.15)'}`,
                borderRadius: '20px',
                fontSize: '12px',
                fontFamily: '"Inter", system-ui, sans-serif',
                cursor: 'pointer',
                color: activeModes.includes(mode.id) 
                  ? getModeColor(mode.id) 
                  : '#5a5044',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ fontSize: '14px' }}>{mode.icon}</span>
              {mode.name}
            </button>
          ))}

          {/* Suggestion Limit Selector */}
            <select
              value={suggestionLimit}
              onChange={(e) => setSuggestionLimit(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid rgba(44,36,22,0.15)',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: '"Inter", system-ui, sans-serif',
                background: '#fff',
                color: '#2c2416',
                cursor: 'pointer',
                marginLeft: 'auto'
              }}
            >
              <option value="5">5 suggestions</option>
              <option value="10">10 suggestions</option>
              <option value="15">15 suggestions</option>
              <option value="25">25 suggestions</option>
              <option value="exhaustive">Exhaustive analysis</option>
            </select>
          
          <button
            onClick={analyzeContent}
            disabled={isAnalyzing || activeModes.length === 0}
            style={{
              padding: '8px 20px',
              background: isAnalyzing 
                ? '#94a3b8' 
                : 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontFamily: '"Inter", system-ui, sans-serif',
              fontWeight: '500',
              cursor: isAnalyzing ? 'wait' : 'pointer',
              color: '#fff',
              boxShadow: isAnalyzing ? 'none' : '0 2px 8px rgba(30,58,95,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isAnalyzing && (
              <span style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {isAnalyzing ? 'Analyzing...' : 'Analyze Content'}
          </button>
        </div>
        
        {error && (
          <div style={{
            maxWidth: '1600px',
            margin: '12px auto 0',
            padding: '10px 16px',
            background: 'rgba(220,38,38,0.1)',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#b91c1c',
            fontFamily: '"Inter", system-ui, sans-serif'
          }}>
            {error}
          </div>
        )}
      </div>
      
      {/* Main Content */}
      <main style={{
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '24px 32px',
        display: 'grid',
        gridTemplateColumns: '1fr 320px 380px',
        gap: '24px',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Editor Panel */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.03)',
          border: '1px solid rgba(44,36,22,0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(44,36,22,0.06)',
            background: 'rgba(250,249,247,0.5)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#1e3a5f',
              margin: 0,
              fontFamily: '"Inter", system-ui, sans-serif'
            }}>
              Chapter Editor
            </h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Prepare Document Button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowPrepareConfirm(true)}
                  disabled={isPreparing || content === SAMPLE_TEXT}
                  style={{
                    padding: '6px 12px',
                    background: isPreparing ? '#94a3b8' : 'linear-gradient(135deg, #b45309 0%, #92400e 100%)',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '11px',
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontWeight: '500',
                    cursor: isPreparing ? 'wait' : 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 4px rgba(180,83,9,0.3)'
                  }}
                >
                  {isPreparing && (
                    <span style={{
                      width: '12px',
                      height: '12px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  )}
                  {isPreparing ? 'Preparing...' : '✦ Prepare Document'}
                </button>
                
                {showPrepareConfirm && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    background: '#fff',
                    border: '1px solid rgba(44,36,22,0.1)',
                    borderRadius: '10px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    padding: '16px',
                    width: '280px',
                    zIndex: 100
                  }}>
                    <p style={{ fontSize: '13px', color: '#2c2416', margin: '0 0 12px 0', fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '1.5' }}>
                      This will automatically:
                    </p>
                    <ul style={{ fontSize: '12px', color: '#5a5044', margin: '0 0 12px 0', paddingLeft: '20px', fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '1.6' }}>
                      <li>Convert footnotes → MLA inline citations</li>
                      <li>Align terminology with Church Style Guide</li>
                    </ul>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handlePrepareDocument}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: 'linear-gradient(135deg, #b45309 0%, #92400e 100%)',
                          border: 'none',
                          borderRadius: '5px',
                          fontSize: '12px',
                          fontFamily: '"Inter", system-ui, sans-serif',
                          fontWeight: '500',
                          cursor: 'pointer',
                          color: '#fff'
                        }}
                      >
                        Prepare Now
                      </button>
                      <button
                        onClick={() => setShowPrepareConfirm(false)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: 'transparent',
                          border: '1px solid rgba(44,36,22,0.2)',
                          borderRadius: '5px',
                          fontSize: '12px',
                          fontFamily: '"Inter", system-ui, sans-serif',
                          fontWeight: '500',
                          cursor: 'pointer',
                          color: '#5a5044'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {suggestions.length > 0 && (
                <button
                  onClick={() => setSuggestions([])}
                  style={{
                    padding: '4px 10px',
                    background: 'transparent',
                    border: '1px solid rgba(44,36,22,0.15)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: '"Inter", system-ui, sans-serif',
                    cursor: 'pointer',
                    color: '#7a6f5f'
                  }}
                >
                  Clear highlights
                </button>
              )}
            </div>
          </div>
          <div ref={editorRef} style={{ flex: 1, padding: '24px', minHeight: '500px' }}>
            {suggestions.length > 0 ? (
              <div style={{ fontSize: '16px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: '#2c2416' }}>
                {renderContentWithHighlights()}
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '500px',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: '16px',
                  lineHeight: '1.8',
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  color: '#2c2416',
                  background: 'transparent'
                }}
                placeholder="Paste your chapter content here..."
              />
            )}
          </div>
        </div>
        
        {/* Suggestions Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            padding: '16px 20px',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            border: '1px solid rgba(44,36,22,0.06)'
          }}>
            <h2 style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f', margin: '0 0 4px 0', fontFamily: '"Inter", system-ui, sans-serif' }}>
              Suggestions
            </h2>
            <p style={{ fontSize: '12px', color: '#7a6f5f', margin: 0, fontFamily: '"Inter", system-ui, sans-serif' }}>
              {suggestions.length} pending
            </p>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
            {suggestions.map(suggestion => (
              <div
                key={suggestion.id}
                style={{
                  background: hoveredSuggestion === suggestion.id ? '#fff' : 'rgba(255,255,255,0.8)',
                  borderRadius: '10px',
                  padding: '16px',
                  border: `1px solid ${hoveredSuggestion === suggestion.id ? getModeColor(suggestion.mode) : 'rgba(44,36,22,0.08)'}`,
                  boxShadow: hoveredSuggestion === suggestion.id ? `0 4px 12px ${getModeColor(suggestion.mode)}20` : '0 1px 3px rgba(0,0,0,0.03)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={() => setHoveredSuggestion(suggestion.id)}
                onMouseLeave={() => setHoveredSuggestion(null)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getModeColor(suggestion.mode) }} />
                  <span style={{ fontSize: '10px', color: getModeColor(suggestion.mode), fontFamily: '"Inter", system-ui, sans-serif', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {EDITORIAL_MODES.find(m => m.id === suggestion.mode)?.name}
                  </span>
                </div>
                
                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <span style={{ textDecoration: 'line-through', color: '#94867a', background: 'rgba(220,38,38,0.08)', padding: '1px 4px', borderRadius: '3px' }}>
                    {suggestion.original.substring(0, 80)}{suggestion.original.length > 80 ? '...' : ''}
                  </span>
                </div>
              <div 
                  onClick={() => setExpandedSuggestion(suggestion)}
                  style={{ fontSize: '13px', marginBottom: '8px', cursor: 'pointer' }}
                  title="Click to view full suggestion"
                >
                  <span style={{ color: '#1e3a5f', fontWeight: '500', background: 'rgba(5,150,105,0.08)', padding: '1px 4px', borderRadius: '3px' }}>
                    {suggestion.suggestion.substring(0, 80)}{suggestion.suggestion.length > 80 ? '...' : ''}
                  </span>
                  {suggestion.suggestion.length > 80 && (
                    <span style={{ fontSize: '11px', color: '#059669', marginLeft: '6px' }}>⤢ expand</span>
                  )}
                </div>
                
                <p style={{ fontSize: '11px', color: '#7a6f5f', margin: '0 0 12px 0', fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '1.5' }}>
                  {suggestion.reason}
                </p>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => acceptSuggestion(suggestion)}
                    style={{ flex: 1, padding: '6px 12px', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', border: 'none', borderRadius: '5px', fontSize: '11px', fontFamily: '"Inter", system-ui, sans-serif', fontWeight: '500', cursor: 'pointer', color: '#fff' }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => dismissSuggestion(suggestion)}
                    style={{ flex: 1, padding: '6px 12px', background: 'transparent', border: '1px solid rgba(44,36,22,0.2)', borderRadius: '5px', fontSize: '11px', fontFamily: '"Inter", system-ui, sans-serif', fontWeight: '500', cursor: 'pointer', color: '#5a5044' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
            
            {suggestions.length === 0 && !isAnalyzing && (
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '10px', padding: '24px 16px', textAlign: 'center', border: '1px dashed rgba(44,36,22,0.15)' }}>
                <p style={{ fontSize: '13px', color: '#7a6f5f', margin: 0, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: '1.6' }}>
                  Select editorial focus areas and click "Analyze" to receive suggestions
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Chat Panel */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.03)',
          border: '1px solid rgba(44,36,22,0.06)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 220px)'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(44,36,22,0.06)', background: 'rgba(250,249,247,0.5)' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a5f', margin: '0 0 4px 0', fontFamily: '"Inter", system-ui, sans-serif' }}>
              Editorial Chat
            </h2>
            <p style={{ fontSize: '11px', color: '#7a6f5f', margin: 0, fontFamily: '"Inter", system-ui, sans-serif' }}>
              Discuss and brainstorm with Claude
            </p>
          </div>
          
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {chatHistory.map((message, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: message.role === 'user' ? 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)' : 'rgba(250,249,247,0.8)',
                  color: message.role === 'user' ? '#fff' : '#2c2416',
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  border: message.role === 'assistant' ? '1px solid rgba(44,36,22,0.08)' : 'none',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {message.content}
              </div>
            ))}
            {isChatLoading && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(250,249,247,0.8)', alignSelf: 'flex-start', border: '1px solid rgba(44,36,22,0.08)' }}>
                <span style={{ opacity: 0.5 }}>Thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          
          <form onSubmit={handleChatSubmit} style={{ padding: '16px', borderTop: '1px solid rgba(44,36,22,0.06)', background: 'rgba(250,249,247,0.3)' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your writing..."
                disabled={isChatLoading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid rgba(44,36,22,0.15)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  outline: 'none',
                  background: '#fff'
                }}
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                style={{
                  padding: '10px 16px',
                  background: isChatLoading || !chatInput.trim() ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isChatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                  color: '#fff',
                  fontSize: '14px'
                }}
              >
                →
              </button>
            </div>
          </form>
        </div>
      </main>
      
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      
      {/* Expanded Suggestion Modal */}
      {expandedSuggestion && (
        <div 
          onClick={() => setExpandedSuggestion(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(44,36,22,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getModeColor(expandedSuggestion.mode) }} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: getModeColor(expandedSuggestion.mode), fontFamily: '"Inter", system-ui, sans-serif' }}>
                  {EDITORIAL_MODES.find(m => m.id === expandedSuggestion.mode)?.name}
                </span>
              </div>
              <button
                onClick={() => setExpandedSuggestion(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#7a6f5f', padding: '0 8px' }}
              >
                ×
              </button>
            </div>
            
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#b91c1c', fontFamily: '"Inter", system-ui, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Original Text
                </label>
                <div style={{ 
                  padding: '16px', 
                  background: 'rgba(220,38,38,0.05)', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(220,38,38,0.15)',
                  fontSize: '15px',
                  lineHeight: '1.7',
                  color: '#7a6f5f',
                  fontFamily: '"Source Serif 4", Georgia, serif'
                }}>
                  {expandedSuggestion.original}
                </div>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#059669', fontFamily: '"Inter", system-ui, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Suggested Replacement
                </label>
                <div style={{ 
                  padding: '16px', 
                  background: 'rgba(5,150,105,0.05)', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(5,150,105,0.2)',
                  fontSize: '15px',
                  lineHeight: '1.7',
                  color: '#1e3a5f',
                  fontWeight: '500',
                  fontFamily: '"Source Serif 4", Georgia, serif'
                }}>
                  {expandedSuggestion.suggestion}
                </div>
              </div>
              
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#7a6f5f', fontFamily: '"Inter", system-ui, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Reason
                </label>
                <div style={{ 
                  padding: '16px', 
                  background: 'rgba(250,249,247,0.8)', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(44,36,22,0.1)',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#5a5044',
                  fontFamily: '"Inter", system-ui, sans-serif'
                }}>
                  {expandedSuggestion.reason}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => { acceptSuggestion(expandedSuggestion); setExpandedSuggestion(null); }}
                  style={{ 
                    flex: 1, 
                    padding: '12px 20px', 
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', 
                    border: 'none', 
                    borderRadius: '8px', 
                    fontSize: '14px', 
                    fontFamily: '"Inter", system-ui, sans-serif', 
                    fontWeight: '600', 
                    cursor: 'pointer', 
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(5,150,105,0.3)'
                  }}
                >
                  Accept Change
                </button>
                <button
                  onClick={() => { dismissSuggestion(expandedSuggestion); setExpandedSuggestion(null); }}
                  style={{ 
                    flex: 1, 
                    padding: '12px 20px', 
                    background: 'transparent', 
                    border: '1px solid rgba(44,36,22,0.2)', 
                    borderRadius: '8px', 
                    fontSize: '14px', 
                    fontFamily: '"Inter", system-ui, sans-serif', 
                    fontWeight: '500', 
                    cursor: 'pointer', 
                    color: '#5a5044' 
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
