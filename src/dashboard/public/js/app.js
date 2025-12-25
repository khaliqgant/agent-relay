var Le=Object.defineProperty;var E=(t,e)=>()=>(t&&(e=t(t=0)),e);var be=(t,e)=>{for(var n in e)Le(t,n,{get:e[n],enumerable:!0})};function V(t){return M.push(t),()=>{let e=M.indexOf(t);e>-1&&M.splice(e,1)}}function w(){M.forEach(t=>t())}function z(t){l.agents=t,w()}function W(t){l.messages=t,w()}function U(t){l.currentChannel=t,w()}function I(t){l.isConnected=t,t&&(l.reconnectAttempts=0),w()}function _(){l.reconnectAttempts++}function J(t){l.ws=t}function Q(){let{messages:t,currentChannel:e}=l;return e==="general"?t:t.filter(n=>n.from===e||n.to===e)}function k(t){l.currentThread=t}function X(t){return l.messages.filter(e=>e.thread===t)}function Y(t){return l.messages.filter(e=>e.thread===t).length}var l,M,L=E(()=>{"use strict";l={agents:[],messages:[],currentChannel:"general",currentThread:null,isConnected:!1,ws:null,reconnectAttempts:0},M=[]});function C(){let t=window.location.protocol==="https:"?"wss:":"ws:",e=new WebSocket(`${t}//${window.location.host}/ws`);e.onopen=()=>{I(!0)},e.onclose=()=>{I(!1);let n=Math.min(1e3*Math.pow(2,l.reconnectAttempts),3e4);_(),setTimeout(C,n)},e.onerror=n=>{console.error("WebSocket error:",n)},e.onmessage=n=>{try{let s=JSON.parse(n.data);Me(s)}catch(s){console.error("Failed to parse message:",s)}},J(e)}function Me(t){console.log("[WS] Received data:",{agentCount:t.agents?.length,messageCount:t.messages?.length}),t.agents&&(console.log("[WS] Setting agents:",t.agents.map(e=>e.name)),z(t.agents)),t.messages&&W(t.messages),G&&G(t)}async function A(t,e,n){try{let s={to:t,message:e};n&&(s.thread=n);let o=await fetch("/api/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)}),i=await o.json();return o.ok&&i.success?{success:!0}:{success:!1,error:i.error||"Failed to send message"}}catch{return{success:!1,error:"Network error - could not send message"}}}var G,Z=E(()=>{"use strict";L();G=null});function S(t){if(!t)return!1;let e=Date.parse(t);return Number.isNaN(e)?!1:Date.now()-e<3e4}function r(t){if(!t)return"";let e=document.createElement("div");return e.textContent=t,e.innerHTML}function B(t){return new Date(t).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}function ee(t){let e=new Date(t),n=new Date,s=new Date(n);return s.setDate(s.getDate()-1),e.toDateString()===n.toDateString()?"Today":e.toDateString()===s.toDateString()?"Yesterday":e.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"})}function f(t){let e=["#e01e5a","#2bac76","#e8a427","#1264a3","#7c3aed","#0d9488","#dc2626","#9333ea","#ea580c","#0891b2"],n=0;for(let s=0;s<t.length;s++)n=t.charCodeAt(s)+((n<<5)-n);return e[Math.abs(n)%e.length]}function h(t){return t.substring(0,2).toUpperCase()}function H(t){if(!t)return"";let e=r(t);return e=e.replace(/```([\s\S]*?)```/g,"<pre>$1</pre>"),e=e.replace(/`([^`]+)`/g,"<code>$1</code>"),e=e.replace(/\n/g,"<br>"),e}var te=E(()=>{"use strict"});function se(){return a={connectionDot:document.getElementById("connection-dot"),channelsList:document.getElementById("channels-list"),agentsList:document.getElementById("agents-list"),messagesList:document.getElementById("messages-list"),currentChannelName:document.getElementById("current-channel-name"),channelTopic:document.getElementById("channel-topic"),onlineCount:document.getElementById("online-count"),messageInput:document.getElementById("message-input"),sendBtn:document.getElementById("send-btn"),boldBtn:document.getElementById("bold-btn"),emojiBtn:document.getElementById("emoji-btn"),searchTrigger:document.getElementById("search-trigger"),commandPaletteOverlay:document.getElementById("command-palette-overlay"),paletteSearch:document.getElementById("palette-search"),paletteResults:document.getElementById("palette-results"),paletteChannelsSection:document.getElementById("palette-channels-section"),paletteAgentsSection:document.getElementById("palette-agents-section"),paletteMessagesSection:document.getElementById("palette-messages-section"),typingIndicator:document.getElementById("typing-indicator"),threadPanelOverlay:document.getElementById("thread-panel-overlay"),threadPanelId:document.getElementById("thread-panel-id"),threadPanelClose:document.getElementById("thread-panel-close"),threadMessages:document.getElementById("thread-messages"),threadMessageInput:document.getElementById("thread-message-input"),threadSendBtn:document.getElementById("thread-send-btn"),mentionAutocomplete:document.getElementById("mention-autocomplete"),mentionAutocompleteList:document.getElementById("mention-autocomplete-list")},a}function D(){return a}function ae(){l.isConnected?a.connectionDot.classList.remove("offline"):a.connectionDot.classList.add("offline")}function oe(){console.log("[UI] renderAgents called, agents:",l.agents.length,l.agents.map(e=>e.name));let t=l.agents.map(e=>{let s=S(e.lastSeen||e.lastActive)?"online":"",o=l.currentChannel===e.name,i=e.needsAttention?"needs-attention":"";return`
      <li class="channel-item ${o?"active":""} ${i}" data-agent="${r(e.name)}">
        <div class="agent-avatar" style="background: ${f(e.name)}">
          ${h(e.name)}
          <span class="presence-indicator ${s}"></span>
        </div>
        <span class="channel-name">${r(e.name)}</span>
        ${e.needsAttention?'<span class="attention-badge">Needs Input</span>':""}
        <div class="agent-actions">
          <button class="agent-action-btn kill-btn agent-kill-btn" data-agent="${r(e.name)}" title="Kill agent">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </li>
    `}).join("");a.agentsList.innerHTML=t||'<li class="channel-item" style="color: var(--text-muted); cursor: default;">No agents connected</li>',a.agentsList.querySelectorAll(".channel-item[data-agent]").forEach(e=>{e.addEventListener("click",n=>{if(n.target.closest(".agent-actions"))return;let s=e.dataset.agent;s&&p(s)})}),we(),Promise.resolve().then(()=>(fe(),ge)).then(({attachKillHandlers:e})=>{e()}).catch(()=>{})}function P(){let t=Q();if(t.length===0){a.messagesList.innerHTML=`
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="empty-state-title">No messages yet</div>
        <div class="empty-state-text">
          ${l.currentChannel==="general"?"Messages between agents will appear here":`Messages with ${l.currentChannel} will appear here`}
        </div>
      </div>
    `;return}let e="",n=null;t.forEach(s=>{let o=new Date(s.timestamp).toDateString();o!==n&&(e+=`
        <div class="date-divider">
          <span class="date-divider-text">${ee(s.timestamp)}</span>
        </div>
      `,n=o);let i=s.to==="*",c=f(s.from),g=Y(s.id),y=i?"@everyone":s.project?`<span class="project-badge">${r(s.project)}</span>@${r(s.to)}`:`@${r(s.to)}`;e+=`
      <div class="message ${i?"broadcast":""}" data-id="${r(s.id)}">
        <div class="message-avatar" style="background: ${c}">
          ${h(s.from)}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">@${r(s.from)}</span>
            <span class="message-recipient">
              \u2192 <span class="target">${y}</span>
            </span>
            <span class="message-timestamp">${B(s.timestamp)}</span>
          </div>
          <div class="message-body">${H(s.content)}</div>
          ${s.thread?`
            <div class="thread-indicator" data-thread="${r(s.thread)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Thread: ${r(s.thread)}
            </div>
          `:""}
          ${g>0?`
            <div class="reply-count-badge" data-thread="${r(s.id)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              ${g} ${g===1?"reply":"replies"}
            </div>
          `:""}
        </div>
        <div class="message-actions">
          <button class="message-action-btn" data-action="reply" title="Reply in thread">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button class="message-action-btn" title="Add reaction">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </button>
        </div>
      </div>
    `}),a.messagesList.innerHTML=e,xe()}function p(t){U(t),a.channelsList.querySelectorAll(".channel-item").forEach(n=>{n.classList.toggle("active",n.dataset.channel===t)}),a.agentsList.querySelectorAll(".channel-item").forEach(n=>{n.classList.toggle("active",n.dataset.agent===t)});let e=document.querySelector(".channel-header-name .prefix");if(t==="general")a.currentChannelName.innerHTML="general",a.channelTopic.textContent="All agent communications",e&&(e.textContent="#");else{a.currentChannelName.innerHTML=r(t);let n=l.agents.find(s=>s.name===t);a.channelTopic.textContent=n?.status||"Direct messages",e&&(e.textContent="@")}a.messageInput.placeholder=t==="general"?"@AgentName message... (or @* to broadcast)":`@${t} your message here...`,P()}function ie(){let t=l.agents.filter(e=>S(e.lastSeen||e.lastActive)).length;a.onlineCount.textContent=`${t} online`}function we(){let t=l.agents.map(s=>{let o=S(s.lastSeen||s.lastActive);return`
      <div class="palette-item" data-jump-agent="${r(s.name)}">
        <div class="palette-item-icon">
          <div class="agent-avatar" style="background: ${f(s.name)}; width: 20px; height: 20px; font-size: 9px;">
            ${h(s.name)}
            <span class="presence-indicator ${o?"online":""}"></span>
          </div>
        </div>
        <div class="palette-item-content">
          <div class="palette-item-title">${r(s.name)}</div>
          <div class="palette-item-subtitle">${o?"Online":"Offline"}</div>
        </div>
      </div>
    `}).join(""),e=a.paletteAgentsSection;e.querySelectorAll(".palette-item").forEach(s=>s.remove()),e.insertAdjacentHTML("beforeend",t),e.querySelectorAll(".palette-item[data-jump-agent]").forEach(s=>{s.addEventListener("click",()=>{let o=s.dataset.jumpAgent;o&&(p(o),u())})})}function le(){a.paletteChannelsSection.querySelectorAll(".palette-item[data-jump-channel]").forEach(t=>{t.addEventListener("click",()=>{let e=t.dataset.jumpChannel;e&&(p(e),u())})})}function j(){a.commandPaletteOverlay.classList.add("visible"),a.paletteSearch.value="",a.paletteSearch.focus(),d=-1,O("")}function re(){return Array.from(a.paletteResults.querySelectorAll(".palette-item")).filter(e=>e.style.display!=="none")}function ne(){let t=re();if(t.forEach(e=>e.classList.remove("selected")),d>=0&&d<t.length){let e=t[d];e.classList.add("selected"),e.scrollIntoView({block:"nearest",behavior:"smooth"})}}function ce(t){let e=re();if(e.length!==0)switch(t.key){case"ArrowDown":t.preventDefault(),d=d<e.length-1?d+1:0,ne();break;case"ArrowUp":t.preventDefault(),d=d>0?d-1:e.length-1,ne();break;case"Enter":t.preventDefault(),d>=0&&d<e.length&&Se(e[d]);break}}function Se(t){let e=t.dataset.command;if(e){e==="broadcast"?(a.messageInput.value="@* ",a.messageInput.focus()):e==="clear"&&(a.messagesList.innerHTML=""),u();return}let n=t.dataset.jumpChannel;if(n){p(n),u();return}let s=t.dataset.jumpAgent;if(s){p(s),u();return}let o=t.dataset.jumpMessage;if(o){let i=a.messagesList.querySelector(`[data-id="${o}"]`);i&&(i.scrollIntoView({behavior:"smooth",block:"center"}),i.classList.add("highlighted"),setTimeout(()=>i.classList.remove("highlighted"),2e3)),u();return}}function u(){a.commandPaletteOverlay.classList.remove("visible")}function O(t){let e=t.toLowerCase();if(d=-1,document.querySelectorAll(".palette-item[data-command]").forEach(n=>{let o=n.querySelector(".palette-item-title")?.textContent?.toLowerCase()||"";n.style.display=o.includes(e)?"flex":"none"}),document.querySelectorAll(".palette-item[data-jump-channel]").forEach(n=>{let o=n.querySelector(".palette-item-title")?.textContent?.toLowerCase()||"";n.style.display=o.includes(e)?"flex":"none"}),document.querySelectorAll(".palette-item[data-jump-agent]").forEach(n=>{let s=n.dataset.jumpAgent?.toLowerCase()||"";n.style.display=s.includes(e)?"flex":"none"}),e.length>=2){let n=l.messages.filter(s=>s.content.toLowerCase().includes(e)).slice(0,5);if(n.length>0){a.paletteMessagesSection.style.display="block";let s=n.map(i=>`
        <div class="palette-item" data-jump-message="${r(i.id)}">
          <div class="palette-item-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="palette-item-content">
            <div class="palette-item-title">${r(i.from)}</div>
            <div class="palette-item-subtitle">${r(i.content.substring(0,60))}${i.content.length>60?"...":""}</div>
          </div>
        </div>
      `).join("");a.paletteMessagesSection.querySelectorAll(".palette-item").forEach(i=>i.remove()),a.paletteMessagesSection.insertAdjacentHTML("beforeend",s)}else a.paletteMessagesSection.style.display="none"}else a.paletteMessagesSection.style.display="none"}function $(t){k(t),a.threadPanelId.textContent=t,a.threadPanelOverlay.classList.add("visible"),a.threadMessageInput.value="",q(t),a.threadMessageInput.focus()}function N(){k(null),a.threadPanelOverlay.classList.remove("visible")}function q(t){let e=X(t);if(e.length===0){a.threadMessages.innerHTML=`
      <div class="thread-empty">
        <p>No messages in this thread yet.</p>
        <p style="font-size: 12px; margin-top: 8px;">Start the conversation below!</p>
      </div>
    `;return}let n=e.map(s=>`
      <div class="thread-message">
        <div class="thread-message-header">
          <div class="thread-message-avatar" style="background: ${f(s.from)}">
            ${h(s.from)}
          </div>
          <span class="thread-message-sender">${r(s.from)}</span>
          <span class="thread-message-time">${B(s.timestamp)}</span>
        </div>
        <div class="thread-message-body">${H(s.content)}</div>
      </div>
    `).join("");a.threadMessages.innerHTML=n,a.threadMessages.scrollTop=a.threadMessages.scrollHeight}function xe(){a.messagesList.querySelectorAll(".thread-indicator").forEach(t=>{t.style.cursor="pointer",t.addEventListener("click",e=>{e.stopPropagation();let n=t.dataset.thread;n&&$(n)})}),a.messagesList.querySelectorAll(".reply-count-badge").forEach(t=>{t.addEventListener("click",e=>{e.stopPropagation();let n=t.dataset.thread;n&&$(n)})}),a.messagesList.querySelectorAll('.message-action-btn[data-action="reply"]').forEach(t=>{t.addEventListener("click",e=>{e.stopPropagation();let n=t.closest(".message")?.getAttribute("data-id");n&&$(n)})})}function de(t){let e=t.toLowerCase();x=l.agents.filter(s=>s.name.toLowerCase().includes(e)),m=0;let n="";("*".includes(e)||"everyone".includes(e)||"all".includes(e)||"broadcast".includes(e))&&(n+=`
      <div class="mention-autocomplete-item ${m===0&&x.length===0?"selected":""}" data-mention="*">
        <div class="agent-avatar" style="background: var(--accent-yellow);">*</div>
        <span class="mention-autocomplete-name">@everyone</span>
        <span class="mention-autocomplete-role">Broadcast to all</span>
      </div>
    `),x.forEach((s,o)=>{n+=`
      <div class="mention-autocomplete-item ${o===m?"selected":""}" data-mention="${r(s.name)}">
        <div class="agent-avatar" style="background: ${f(s.name)}">
          ${h(s.name)}
        </div>
        <span class="mention-autocomplete-name">@${r(s.name)}</span>
        <span class="mention-autocomplete-role">${r(s.role||"Agent")}</span>
      </div>
    `}),n===""&&(n='<div class="mention-autocomplete-item" style="color: var(--text-muted); cursor: default;">No matching agents</div>'),a.mentionAutocompleteList.innerHTML=n,a.mentionAutocomplete.classList.add("visible"),a.mentionAutocompleteList.querySelectorAll(".mention-autocomplete-item[data-mention]").forEach(s=>{s.addEventListener("click",()=>{let o=s.dataset.mention;o&&R(o)})})}function v(){a.mentionAutocomplete.classList.remove("visible"),x=[],m=0}function me(){return a.mentionAutocomplete.classList.contains("visible")}function K(t){let e=a.mentionAutocompleteList.querySelectorAll(".mention-autocomplete-item[data-mention]");e.length!==0&&(e[m]?.classList.remove("selected"),t==="down"?m=(m+1)%e.length:m=(m-1+e.length)%e.length,e[m]?.classList.add("selected"),e[m]?.scrollIntoView({block:"nearest"}))}function R(t){let e=a.mentionAutocompleteList.querySelectorAll(".mention-autocomplete-item[data-mention]"),n=t;if(!n&&e.length>0&&(n=e[m]?.dataset.mention),!n){v();return}let s=a.messageInput,o=s.value,i=o.match(/^@\S*/);if(i){let c=`@${n} `;s.value=c+o.substring(i[0].length),s.selectionStart=s.selectionEnd=c.length}v(),s.focus()}function ue(){let t=a.messageInput,e=t.value,n=t.selectionStart,s=e.match(/^@(\S*)/);return s&&n<=s[0].length?s[1]:null}var a,d,m,x,pe=E(()=>{"use strict";L();te();d=-1;m=0,x=[]});var ge={};be(ge,{attachKillHandlers:()=>He,initApp:()=>F});function Te(){let e=window.location.pathname.match(/^\/project\/([^/]+)$/);return e?{projectId:decodeURIComponent(e[1]),fromBridge:!0}:{projectId:null,fromBridge:!1}}async function Ie(t){let e=document.querySelector(".workspace-name");if(e)try{let o=await fetch(`/api/project/${encodeURIComponent(t)}`);if(o.ok){let i=await o.json(),c=e.querySelector(":not(.status-dot)");c&&c.nodeType===Node.TEXT_NODE?c.textContent=i.name||t:(Array.from(e.childNodes).filter(y=>y.nodeType===Node.TEXT_NODE).forEach(y=>y.textContent=""),e.appendChild(document.createTextNode(" "+(i.name||t))))}}catch{}let n=document.getElementById("bridge-link-text"),s=document.getElementById("bridge-nav-link");n&&(n.textContent="\u2190 Back to Bridge"),s&&s.classList.add("back-to-bridge"),document.body.classList.add("project-view")}function F(){let t=se(),{projectId:e,fromBridge:n}=Te();n&&e&&Ie(e),V(()=>{ae(),oe(),P(),ie()}),ke(t),C()}function ke(t){t.channelsList.querySelectorAll(".channel-item").forEach(e=>{e.addEventListener("click",()=>{let n=e.dataset.channel;n&&p(n)})}),t.sendBtn.addEventListener("click",he),t.messageInput.addEventListener("keydown",e=>{if(me()){if(e.key==="Tab"||e.key==="Enter"){e.preventDefault(),R();return}if(e.key==="ArrowUp"){e.preventDefault(),K("up");return}if(e.key==="ArrowDown"){e.preventDefault(),K("down");return}if(e.key==="Escape"){e.preventDefault(),v();return}}e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),he())}),t.messageInput.addEventListener("input",()=>{t.messageInput.style.height="auto",t.messageInput.style.height=Math.min(t.messageInput.scrollHeight,200)+"px";let e=ue();e!==null?de(e):v()}),t.messageInput.addEventListener("blur",()=>{setTimeout(()=>{v()},150)}),t.boldBtn.addEventListener("click",()=>{let e=t.messageInput,n=e.selectionStart,s=e.selectionEnd,o=e.value;if(n===s){let i=o.substring(0,n),c=o.substring(s);e.value=i+"**bold**"+c,e.selectionStart=n+2,e.selectionEnd=n+6}else{let i=o.substring(0,n),c=o.substring(n,s),g=o.substring(s);e.value=i+"**"+c+"**"+g,e.selectionStart=n,e.selectionEnd=s+4}e.focus()}),t.emojiBtn.addEventListener("click",()=>{let e=["\u{1F44D}","\u{1F44E}","\u2705","\u274C","\u{1F389}","\u{1F525}","\u{1F4A1}","\u26A0\uFE0F","\u{1F4DD}","\u{1F680}"],n=e[Math.floor(Math.random()*e.length)],s=t.messageInput,o=s.selectionStart,i=s.value;s.value=i.substring(0,o)+n+i.substring(o),s.selectionStart=s.selectionEnd=o+n.length,s.focus()}),t.searchTrigger.addEventListener("click",j),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.key==="k"&&(e.preventDefault(),t.commandPaletteOverlay.classList.contains("visible")?u():j()),e.key==="Escape"&&u()}),t.commandPaletteOverlay.addEventListener("click",e=>{e.target===t.commandPaletteOverlay&&u()}),t.paletteSearch.addEventListener("input",e=>{let n=e.target;O(n.value)}),t.paletteSearch.addEventListener("keydown",ce),document.querySelectorAll(".palette-item[data-command]").forEach(e=>{e.addEventListener("click",()=>{let n=e.dataset.command;n==="bridge"?window.location.href="/bridge":n==="broadcast"?(t.messageInput.value="@* ",t.messageInput.focus()):n==="clear"&&(t.messagesList.innerHTML=""),u()})}),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.key==="b"&&(e.preventDefault(),window.location.href="/bridge")}),le(),t.threadPanelClose.addEventListener("click",N),t.threadSendBtn.addEventListener("click",ve),t.threadMessageInput.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),ve())}),document.addEventListener("keydown",e=>{e.key==="Escape"&&t.threadPanelOverlay.classList.contains("visible")&&N()})}function Ce(t){let n=t.trim().match(/^@(\*|[^\s]+)\s+(.+)$/s);return n?{to:n[1],message:n[2].trim()}:null}async function he(){let t=D(),e=t.messageInput.value.trim();if(!e)return;let n=Ce(e);if(!n){alert('Message must start with @recipient (e.g., "@Lead hello" or "@* broadcast")');return}let{to:s,message:o}=n;t.sendBtn.disabled=!0;let i=await A(s,o);i.success?(t.messageInput.value="",t.messageInput.style.height="auto"):alert(i.error),t.sendBtn.disabled=!1}async function ve(){let t=D(),e=t.threadMessageInput.value.trim(),n=l.currentThread;if(!e||!n)return;t.threadSendBtn.disabled=!0;let s=await A("*",e,n);s.success?(t.threadMessageInput.value="",q(n)):alert(s.error),t.threadSendBtn.disabled=!1}function T(){return{overlay:document.getElementById("spawn-modal-overlay"),closeBtn:document.getElementById("spawn-modal-close"),cancelBtn:document.getElementById("spawn-modal-cancel"),submitBtn:document.getElementById("spawn-modal-submit"),nameInput:document.getElementById("spawn-agent-name"),cliSelect:document.getElementById("spawn-agent-cli"),modelInput:document.getElementById("spawn-agent-model"),taskInput:document.getElementById("spawn-agent-task")}}function Ae(){let t=T();t.overlay&&(t.overlay.classList.add("visible"),t.nameInput?.focus())}function b(){let t=T();t.overlay&&(t.overlay.classList.remove("visible"),t.nameInput&&(t.nameInput.value=""),t.cliSelect&&(t.cliSelect.value="claude"),t.modelInput&&(t.modelInput.value=""),t.taskInput&&(t.taskInput.value=""))}async function ye(){let t=T(),e=t.nameInput?.value.trim(),n=t.cliSelect?.value,s=t.modelInput?.value.trim(),o=t.taskInput?.value.trim();if(!e){alert("Please enter an agent name");return}if(!n){alert("Please select a CLI tool");return}t.submitBtn&&(t.submitBtn.textContent="Spawning...",t.submitBtn.disabled=!0);try{let i=await fetch("/api/agent/spawn",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:e,cli:n,model:s||void 0,task:o||void 0})}),c=await i.json();i.ok&&c.success?b():alert(c.error||"Failed to spawn agent")}catch(i){console.error("Failed to spawn agent:",i),alert("Failed to spawn agent. Check console for details.")}finally{t.submitBtn&&(t.submitBtn.textContent="Spawn Agent",t.submitBtn.disabled=!1)}}async function Be(t){if(confirm(`Are you sure you want to kill agent "${t}"?`))try{let e=await fetch("/api/agent/kill",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:t})}),n=await e.json();e.ok||alert(n.error||"Failed to kill agent")}catch(e){console.error("Failed to kill agent:",e),alert("Failed to kill agent. Check console for details.")}}function Ee(){let t=T(),e=document.getElementById("spawn-agent-btn");e&&e.addEventListener("click",n=>{n.stopPropagation(),Ae()}),t.closeBtn?.addEventListener("click",b),t.cancelBtn?.addEventListener("click",b),t.submitBtn?.addEventListener("click",ye),t.overlay?.addEventListener("click",n=>{n.target===t.overlay&&b()}),document.addEventListener("keydown",n=>{n.key==="Escape"&&t.overlay?.classList.contains("visible")&&b()}),t.nameInput?.addEventListener("keydown",n=>{n.key==="Enter"&&ye()})}function He(){document.querySelectorAll(".agent-kill-btn").forEach(t=>{t.addEventListener("click",e=>{e.stopPropagation();let n=t.dataset.agent;n&&Be(n)})})}var fe=E(()=>{L();Z();pe();L();typeof document<"u"&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{F(),Ee()}):(F(),Ee()))});fe();export{He as attachKillHandlers,F as initApp};
//# sourceMappingURL=app.js.map
