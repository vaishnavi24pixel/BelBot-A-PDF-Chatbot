    let pdfText = "";
    let pdfSentences = [];
    let currentAnswers = [];   // Array of answer objects {sentence, score}
    let currentAnswerIndex = 0; // Tracks which answer to show next
    let currentQuestion = "";  // Stores the current question

    // Variables for TF-IDF computations
    let idf = {};            // Inverse Document Frequency dictionary
    let pdfDocCount = 0;     // Total number of sentences in the merged PDFs

    // Global array to store PDF page objects (text, canvas, container)
    let pdfPages = [];

    // A set of common stop words to filter out.
    const stopwords = new Set([
      "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with",
      "without", "is", "are", "was", "were", "be", "been", "being", "this", "that",
      "these", "those", "it", "its", "as", "by", "from", "but", "if", "then"
    ]);

    // A simple (naive) stemmer that removes common suffixes.
    function stem(word) {
      return word.replace(/(ing|ed|ly|es|s)$/, '');
    }

    // Preprocess text: lower-case, remove punctuation, filter stopwords, and stem tokens.
    function preprocess(text) {
      let tokens = text.toLowerCase().match(/\b\w+\b/g) || [];
      return tokens.filter(token => !stopwords.has(token)).map(stem);
    }

    // Compute term frequency for an array of tokens.
    function getTF(tokens) {
      const tf = {};
      tokens.forEach(token => {
        tf[token] = (tf[token] || 0) + 1;
      });
      return tf;
    }

    // Compute the TF-IDF vector for a given text.
    function getTFIDFVector(text) {
      let tokens = preprocess(text);
      let tf = getTF(tokens);
      let tfidf = {};
      for (let word in tf) {
        let wordIdf = idf[word] || Math.log(pdfDocCount / 1);
        tfidf[word] = tf[word] * wordIdf;
      }
      return tfidf;
    }

    // Compute cosine similarity between two texts using their TF-IDF vectors.
    function cosineSimilarity(str1, str2) {
      const vector1 = getTFIDFVector(str1);
      const vector2 = getTFIDFVector(str2);
      const intersection = Object.keys(vector1).filter(word => word in vector2);
      let dotProduct = 0;
      intersection.forEach(word => {
        dotProduct += vector1[word] * vector2[word];
      });
      const magnitude1 = Math.sqrt(Object.values(vector1).reduce((sum, val) => sum + val * val, 0));
      const magnitude2 = Math.sqrt(Object.values(vector2).reduce((sum, val) => sum + val * val, 0));
      if (magnitude1 === 0 || magnitude2 === 0) return 0;
      return dotProduct / (magnitude1 * magnitude2);
    }

    // After the PDFs are loaded, compute the inverse document frequency (IDF) for each word.
    function computeIDF() {
      idf = {};
      pdfSentences.forEach(sentence => {
        let tokens = new Set(preprocess(sentence));
        tokens.forEach(word => {
          idf[word] = (idf[word] || 0) + 1;
        });
      });
      for (let word in idf) {
        idf[word] = Math.log(pdfDocCount / idf[word]);
      }
    }

    // Toggle selection of a PDF page for section-based summary.
    function togglePageSelection(container) {
      container.classList.toggle("selected-page");
    }

    // Handle file upload for multiple PDFs.
    function handleFileUpload(event) {
      const files = event.target.files;
      if (files.length > 0) {
        document.getElementById("pdfViewer").innerHTML = "";
        pdfPages = [];
        pdfText = "";
        pdfSentences = [];
        let filePromises = [];
        for (let i = 0; i < files.length; i++) {
          let file = files[i];
          if (file.type === "application/pdf") {
            filePromises.push(new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = function () {
                const pdfData = new Uint8Array(reader.result);
                pdfjsLib.getDocument(pdfData).promise.then(pdf => {
                  let pagePromises = [];
                  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    pagePromises.push(
                      pdf.getPage(pageNum).then(page => {
                        return page.getTextContent().then(textContent => {
                          let pageText = textContent.items.map(item => item.str).join(" ");
                          const pageContainer = document.createElement("div");
                          pageContainer.className = "pdf-page";
                          const canvas = document.createElement("canvas");
                          const context = canvas.getContext("2d");
                          const viewport = page.getViewport({ scale: 1.2 });
                          canvas.height = viewport.height;
                          canvas.width = viewport.width;
                          pageContainer.appendChild(canvas);
                          document.getElementById("pdfViewer").appendChild(pageContainer);
                          // Attach event listener for selection
                          pageContainer.addEventListener("click", function(e) {
                            e.stopPropagation();
                            togglePageSelection(pageContainer);
                          });
                          return page.render({ canvasContext: context, viewport: viewport }).promise.then(() => {
                            return { pageNum: pageNum, text: pageText, canvas: canvas, container: pageContainer };
                          });
                        });
                      })
                    );
                  }
                  Promise.all(pagePromises).then(pages => {
                    resolve(pages);
                  });
                }).catch(reject);
              };
              reader.readAsArrayBuffer(file);
            }));
          }
        }
        Promise.all(filePromises).then(fileResults => {
          fileResults.forEach(pageArray => {
            pdfPages = pdfPages.concat(pageArray);
          });
          pdfText = pdfPages.map(p => p.text).join(" ");
          pdfSentences = pdfText.split(/(?<=[.!?])\s+/);
          pdfDocCount = pdfSentences.length;
          computeIDF();
          showMessage("PDF(s) loaded successfully. Ask a question, generate a summary, or select pages for section-based summary.");
        });
      } else {
        showMessage("Please upload at least one PDF file.");
      }
    }

    document.getElementById('pdfFile').addEventListener('change', handleFileUpload);

    // Append a message to the chat box with an avatar icon.
    function showMessage(message, isUser = false) {
      const chatbox = document.getElementById("chatbox");
      
      const messageContainer = document.createElement("div");
      messageContainer.classList.add("message-item");
      if(isUser) {
        messageContainer.classList.add("user-message-item");
      }
      
      const avatar = document.createElement("div");
      avatar.classList.add("avatar");
      if(isUser) {
        avatar.innerHTML = '<i class="fas fa-user"></i>';
      } else {
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
      }
      
      const messageText = document.createElement("div");
      messageText.classList.add("message", isUser ? "user-message" : "bot-message");
      messageText.innerHTML = message;
      
      // Arrange the order of avatar and message
      if(isUser) {
        messageContainer.appendChild(messageText);
        messageContainer.appendChild(avatar);
      } else {
        messageContainer.appendChild(avatar);
        messageContainer.appendChild(messageText);
      }
      
      chatbox.appendChild(messageContainer);
      chatbox.scrollTop = chatbox.scrollHeight;
    }

    // Uses SpeechSynthesis to speak a given text.
    function speakText(text) {
      const utterance = new SpeechSynthesisUtterance(text);
      speechSynthesis.speak(utterance);
    }

    // Returns up to 10 sentences from the merged PDFs sorted by TF-IDF cosine similarity to the question.
    function getAnswersFromPDF(sentences, question) {
      const answers = [];
      sentences.forEach(sentence => {
        const score = cosineSimilarity(sentence, question);
        if (score > 0.3) {
          answers.push({ sentence: sentence, score: score });
        }
      });
      answers.sort((a, b) => b.score - a.score);
      if (answers.length === 0) {
        return [{ sentence: "Sorry, I couldn't find relevant information.", score: 0 }];
      }
      return answers.slice(0, 10);
    }

    // Scrolls to the PDF page that likely contains the answer.
    function scrollToPageForAnswer(answerSentence) {
      const snippet = answerSentence.slice(0, 30).toLowerCase();
      for (const page of pdfPages) {
        if (page.text.toLowerCase().includes(snippet)) {
          page.container.scrollIntoView({ behavior: "smooth", block: "center" });
          page.canvas.classList.add("highlight-canvas");
          setTimeout(() => {
            page.canvas.classList.remove("highlight-canvas");
          }, 2000);
          break;
        }
      }
    }

    // Highlights pages that contain key summary sentences (visual summary).
    function highlightPagesForSummary(summarySentences) {
      pdfPages.forEach(page => page.container.classList.remove("visual-summary-highlight"));
      summarySentences.forEach(sentence => {
        const snippet = sentence.slice(0, 30).toLowerCase();
        for (const page of pdfPages) {
          if (page.text.toLowerCase().includes(snippet)) {
            page.container.classList.add("visual-summary-highlight");
          }
        }
      });
      setTimeout(() => {
        pdfPages.forEach(page => page.container.classList.remove("visual-summary-highlight"));
      }, 5000);
    }

    // Displays an answer in the chat, speaks it, and scrolls to the corresponding PDF page.
    function displayAnswer(sentence, question) {
      const highlightedSentence = sentence.replace(new RegExp(question, 'gi'), match => `<span class="highlight">${match}</span>`);
      showMessage(highlightedSentence, false);
      speakText(sentence);
      scrollToPageForAnswer(sentence);
    }

    function askQuestion() {
      const question = document.getElementById('questionInput').value;
      if (question && pdfText) {
        showMessage(`<span class="highlight">${question}</span>`, true);
        currentQuestion = question;
        const answers = getAnswersFromPDF(pdfSentences, question);
        currentAnswers = answers;
        currentAnswerIndex = 1;
        displayAnswer(answers[0].sentence, question);
        document.getElementById('moreButton').style.display = answers.length > 1 ? "block" : "none";
        document.getElementById('questionInput').value = "";
      } else {
        showMessage("Please upload at least one PDF and ask a question.", false);
      }
    }

    function showMoreAnswers() {
      if (currentAnswerIndex < currentAnswers.length) {
        displayAnswer(currentAnswers[currentAnswerIndex].sentence, currentQuestion);
        currentAnswerIndex++;
        if (currentAnswerIndex >= currentAnswers.length) {
          document.getElementById('moreButton').style.display = "none";
        }
      } else {
        document.getElementById('moreButton').style.display = "none";
      }
    }

    // Starts voice recognition using the Web Speech API.
    function startVoiceInput() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in your browser.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.start();
      recognition.onresult = function(event) {
        if (event.results.length > 0) {
          const transcript = event.results[0][0].transcript;
          document.getElementById('questionInput').value = transcript;
          askQuestion();
        }
      };
      recognition.onerror = function(event) {
        console.error("Speech recognition error:", event.error);
        alert("Speech recognition error: " + event.error);
      };
    }

    // NEW FEATURE: Summarization (Entire Document)
    function generateSummary(text) {
      if (!text) return "No content available for summarization.";
      let sentences = text.split(/(?<=[.!?])\s+/);
      if (sentences.length === 0) return "No content available for summarization.";
      let wordFreq = {};
      let tokens = preprocess(text);
      tokens.forEach(token => {
        wordFreq[token] = (wordFreq[token] || 0) + 1;
      });
      let sentenceScores = sentences.map(sentence => {
        let sentenceTokens = preprocess(sentence);
        let score = 0;
        sentenceTokens.forEach(token => {
          score += wordFreq[token] || 0;
        });
        return { sentence, score };
      });
      let summaryCount = Math.floor(sentences.length * 0.1);
      summaryCount = Math.max(summaryCount, 3);
      summaryCount = Math.min(summaryCount, 10);
      let topSentences = sentenceScores.sort((a, b) => b.score - a.score).slice(0, summaryCount);
      topSentences.sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));
      let summaryHtml = "<ul>";
      let summarySentences = [];
      topSentences.forEach(item => {
        summaryHtml += "<li>" + item.sentence + "</li>";
        summarySentences.push(item.sentence);
      });
      summaryHtml += "</ul>";
      return { html: summaryHtml, sentences: summarySentences };
    }

    // Summarizes the entire document and displays the summary in the chat.
    function summarizeDocument() {
      if (!pdfText) {
        showMessage("Please upload at least one PDF file.", false);
        return;
      }
      let result = generateSummary(pdfText);
      showMessage("<strong>Summary:</strong><br>" + result.html, false);
      speakText("Here is the summary of the document.");
      highlightPagesForSummary(result.sentences);
    }

    // NEW FEATURE: Summarize only selected pages.
    function summarizeSelection() {
      let selectedText = "";
      pdfPages.forEach(page => {
        if (page.container.classList.contains("selected-page")) {
          selectedText += page.text + " ";
        }
      });
      if (!selectedText.trim()) {
        showMessage("No pages selected. Click on PDF pages to select them for summarization.", false);
        return;
      }
      let result = generateSummary(selectedText);
      showMessage("<strong>Section Summary:</strong><br>" + result.html, false);
      speakText("Here is the summary of the selected section.");
      highlightPagesForSummary(result.sentences);
    }

    // Functions for background color change.
    function change(){
      if(document.body.style.backgroundColor=="#121212"){
          document.body.style.backgroundColor="#f1f7f9";
      } else {
          document.body.style.backgroundColor="#121212";
      }
    }
    function c(){
      document.body.style.backgroundColor="#ffab40"; /* Modern Orange */
    }
    function d(){
      document.body.style.backgroundColor="#26a69a"; /* Soothing Teal */
    }
    function b(){
      document.body.style.backgroundColor="#aed581"; /* Soft Lime-green */
    }
    function navy(){
      document.body.style.backgroundColor="#039be5"; /* Fresh Blue */
    }
    function z(){
      document.body.style.backgroundColor="#00acc1"; /* Bright Cyan */
    }
