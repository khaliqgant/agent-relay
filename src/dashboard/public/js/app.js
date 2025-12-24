var r={agents:[],messages:[],currentChannel:"general",currentThread:null,isConnected:!1,ws:null,reconnectAttempts:0},E=[];function N(t){return E.push(t),()=>{let e=E.indexOf(t);e>-1&&E.splice(e,1)}}function L(){E.forEach(t=>t())}function q(t){r.agents=t,L()}function R(t){r.messages=t,L()}function K(t){r.currentChannel=t,L()}function x(t){r.isConnected=t,t&&(r.reconnectAttempts=0),L()}function V(){r.reconnectAttempts++}function z(t){r.ws=t}function W(){let{messages:t,currentChannel:e}=r;return e==="general"?t:t.filter(n=>n.from===e||n.to===e)}function S(t){r.currentThread=t}function U(t){return r.messages.filter(e=>e.thread===t)}function _(t){return r.messages.filter(e=>e.thread===t).length}var F=null;function T(){let t=window.location.protocol==="https:"?"wss:":"ws:",e=new WebSocket(`${t}//${window.location.host}/ws`);e.onopen=()=>{x(!0)},e.onclose=()=>{x(!1);let n=Math.min(1e3*Math.pow(2,r.reconnectAttempts),3e4);V(),setTimeout(T,n)},e.onerror=n=>{console.error("WebSocket error:",n)},e.onmessage=n=>{try{let s=JSON.parse(n.data);ce(s)}catch(s){console.error("Failed to parse message:",s)}},z(e)}function ce(t){console.log("[WS] Received data:",{agentCount:t.agents?.length,messageCount:t.messages?.length}),t.agents&&(console.log("[WS] Setting agents:",t.agents.map(e=>e.name)),q(t.agents)),t.messages&&R(t.messages),F&&F(t)}async function w(t,e,n){try{let s={to:t,message:e};n&&(s.thread=n);let o=await fetch("/api/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)}),i=await o.json();return o.ok&&i.success?{success:!0}:{success:!1,error:i.error||"Failed to send message"}}catch{return{success:!1,error:"Network error - could not send message"}}}function b(t){if(!t)return!1;let e=Date.parse(t);return Number.isNaN(e)?!1:Date.now()-e<3e4}function l(t){if(!t)return"";let e=document.createElement("div");return e.textContent=t,e.innerHTML}function C(t){return new Date(t).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}function J(t){let e=new Date(t),n=new Date,s=new Date(n);return s.setDate(s.getDate()-1),e.toDateString()===n.toDateString()?"Today":e.toDateString()===s.toDateString()?"Yesterday":e.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"})}function h(t){let e=["#e01e5a","#2bac76","#e8a427","#1264a3","#7c3aed","#0d9488","#dc2626","#9333ea","#ea580c","#0891b2"],n=0;for(let s=0;s<t.length;s++)n=t.charCodeAt(s)+((n<<5)-n);return e[Math.abs(n)%e.length]}function f(t){return t.substring(0,2).toUpperCase()}function A(t){if(!t)return"";let e=l(t);return e=e.replace(/```([\s\S]*?)```/g,"<pre>$1</pre>"),e=e.replace(/`([^`]+)`/g,"<code>$1</code>"),e=e.replace(/\n/g,"<br>"),e}var a,c=-1;function X(){return a={connectionDot:document.getElementById("connection-dot"),channelsList:document.getElementById("channels-list"),agentsList:document.getElementById("agents-list"),messagesList:document.getElementById("messages-list"),currentChannelName:document.getElementById("current-channel-name"),channelTopic:document.getElementById("channel-topic"),onlineCount:document.getElementById("online-count"),messageInput:document.getElementById("message-input"),sendBtn:document.getElementById("send-btn"),boldBtn:document.getElementById("bold-btn"),emojiBtn:document.getElementById("emoji-btn"),searchTrigger:document.getElementById("search-trigger"),commandPaletteOverlay:document.getElementById("command-palette-overlay"),paletteSearch:document.getElementById("palette-search"),paletteResults:document.getElementById("palette-results"),paletteChannelsSection:document.getElementById("palette-channels-section"),paletteAgentsSection:document.getElementById("palette-agents-section"),paletteMessagesSection:document.getElementById("palette-messages-section"),typingIndicator:document.getElementById("typing-indicator"),threadPanelOverlay:document.getElementById("thread-panel-overlay"),threadPanelId:document.getElementById("thread-panel-id"),threadPanelClose:document.getElementById("thread-panel-close"),threadMessages:document.getElementById("thread-messages"),threadMessageInput:document.getElementById("thread-message-input"),threadSendBtn:document.getElementById("thread-send-btn"),mentionAutocomplete:document.getElementById("mention-autocomplete"),mentionAutocompleteList:document.getElementById("mention-autocomplete-list")},a}function k(){return a}function Y(){r.isConnected?a.connectionDot.classList.remove("offline"):a.connectionDot.classList.add("offline")}function G(){console.log("[UI] renderAgents called, agents:",r.agents.length,r.agents.map(e=>e.name));let t=r.agents.map(e=>{let s=b(e.lastSeen||e.lastActive)?"online":"",o=r.currentChannel===e.name,i=e.needsAttention?"needs-attention":"";return`
      <li class="channel-item ${o?"active":""} ${i}" data-agent="${l(e.name)}">
        <div class="agent-avatar" style="background: ${h(e.name)}">
          ${f(e.name)}
          <span class="presence-indicator ${s}"></span>
        </div>
        <span class="channel-name">${l(e.name)}</span>
        ${e.needsAttention?'<span class="attention-badge">Needs Input</span>':""}
      </li>
    `}).join("");a.agentsList.innerHTML=t||'<li class="channel-item" style="color: var(--text-muted); cursor: default;">No agents connected</li>',a.agentsList.querySelectorAll(".channel-item[data-agent]").forEach(e=>{e.addEventListener("click",()=>{let n=e.dataset.agent;n&&p(n)})}),de()}function B(){let t=W();if(t.length===0){a.messagesList.innerHTML=`
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="empty-state-title">No messages yet</div>
        <div class="empty-state-text">
          ${r.currentChannel==="general"?"Messages between agents will appear here":`Messages with ${r.currentChannel} will appear here`}
        </div>
      </div>
    `;return}let e="",n=null;t.forEach(s=>{let o=new Date(s.timestamp).toDateString();o!==n&&(e+=`
        <div class="date-divider">
          <span class="date-divider-text">${J(s.timestamp)}</span>
        </div>
      `,n=o);let i=s.to==="*",d=h(s.from),g=_(s.id),y=i?"@everyone":s.project?`<span class="project-badge">${l(s.project)}</span>@${l(s.to)}`:`@${l(s.to)}`;e+=`
      <div class="message ${i?"broadcast":""}" data-id="${l(s.id)}">
        <div class="message-avatar" style="background: ${d}">
          ${f(s.from)}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">@${l(s.from)}</span>
            <span class="message-recipient">
              \u2192 <span class="target">${y}</span>
            </span>
            <span class="message-timestamp">${C(s.timestamp)}</span>
          </div>
          <div class="message-body">${A(s.content)}</div>
          ${s.thread?`
            <div class="thread-indicator" data-thread="${l(s.thread)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Thread: ${l(s.thread)}
            </div>
          `:""}
          ${g>0?`
            <div class="reply-count-badge" data-thread="${l(s.id)}">
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
    `}),a.messagesList.innerHTML=e,ue()}function p(t){K(t),a.channelsList.querySelectorAll(".channel-item").forEach(n=>{n.classList.toggle("active",n.dataset.channel===t)}),a.agentsList.querySelectorAll(".channel-item").forEach(n=>{n.classList.toggle("active",n.dataset.agent===t)});let e=document.querySelector(".channel-header-name .prefix");if(t==="general")a.currentChannelName.innerHTML="general",a.channelTopic.textContent="All agent communications",e&&(e.textContent="#");else{a.currentChannelName.innerHTML=l(t);let n=r.agents.find(s=>s.name===t);a.channelTopic.textContent=n?.status||"Direct messages",e&&(e.textContent="@")}a.messageInput.placeholder=t==="general"?"@AgentName message... (or @* to broadcast)":`@${t} your message here...`,B()}function Z(){let t=r.agents.filter(e=>b(e.lastSeen||e.lastActive)).length;a.onlineCount.textContent=`${t} online`}function de(){let t=r.agents.map(s=>{let o=b(s.lastSeen||s.lastActive);return`
      <div class="palette-item" data-jump-agent="${l(s.name)}">
        <div class="palette-item-icon">
          <div class="agent-avatar" style="background: ${h(s.name)}; width: 20px; height: 20px; font-size: 9px;">
            ${f(s.name)}
            <span class="presence-indicator ${o?"online":""}"></span>
          </div>
        </div>
        <div class="palette-item-content">
          <div class="palette-item-title">${l(s.name)}</div>
          <div class="palette-item-subtitle">${o?"Online":"Offline"}</div>
        </div>
      </div>
    `}).join(""),e=a.paletteAgentsSection;e.querySelectorAll(".palette-item").forEach(s=>s.remove()),e.insertAdjacentHTML("beforeend",t),e.querySelectorAll(".palette-item[data-jump-agent]").forEach(s=>{s.addEventListener("click",()=>{let o=s.dataset.jumpAgent;o&&(p(o),u())})})}function ee(){a.paletteChannelsSection.querySelectorAll(".palette-item[data-jump-channel]").forEach(t=>{t.addEventListener("click",()=>{let e=t.dataset.jumpChannel;e&&(p(e),u())})})}function $(){a.commandPaletteOverlay.classList.add("visible"),a.paletteSearch.value="",a.paletteSearch.focus(),c=-1,D("")}function te(){return Array.from(a.paletteResults.querySelectorAll(".palette-item")).filter(e=>e.style.display!=="none")}function Q(){let t=te();if(t.forEach(e=>e.classList.remove("selected")),c>=0&&c<t.length){let e=t[c];e.classList.add("selected"),e.scrollIntoView({block:"nearest",behavior:"smooth"})}}function ne(t){let e=te();if(e.length!==0)switch(t.key){case"ArrowDown":t.preventDefault(),c=c<e.length-1?c+1:0,Q();break;case"ArrowUp":t.preventDefault(),c=c>0?c-1:e.length-1,Q();break;case"Enter":t.preventDefault(),c>=0&&c<e.length&&me(e[c]);break}}function me(t){let e=t.dataset.command;if(e){e==="broadcast"?(a.messageInput.value="@* ",a.messageInput.focus()):e==="clear"&&(a.messagesList.innerHTML=""),u();return}let n=t.dataset.jumpChannel;if(n){p(n),u();return}let s=t.dataset.jumpAgent;if(s){p(s),u();return}let o=t.dataset.jumpMessage;if(o){let i=a.messagesList.querySelector(`[data-id="${o}"]`);i&&(i.scrollIntoView({behavior:"smooth",block:"center"}),i.classList.add("highlighted"),setTimeout(()=>i.classList.remove("highlighted"),2e3)),u();return}}function u(){a.commandPaletteOverlay.classList.remove("visible")}function D(t){let e=t.toLowerCase();if(c=-1,document.querySelectorAll(".palette-item[data-command]").forEach(n=>{let o=n.querySelector(".palette-item-title")?.textContent?.toLowerCase()||"";n.style.display=o.includes(e)?"flex":"none"}),document.querySelectorAll(".palette-item[data-jump-channel]").forEach(n=>{let o=n.querySelector(".palette-item-title")?.textContent?.toLowerCase()||"";n.style.display=o.includes(e)?"flex":"none"}),document.querySelectorAll(".palette-item[data-jump-agent]").forEach(n=>{let s=n.dataset.jumpAgent?.toLowerCase()||"";n.style.display=s.includes(e)?"flex":"none"}),e.length>=2){let n=r.messages.filter(s=>s.content.toLowerCase().includes(e)).slice(0,5);if(n.length>0){a.paletteMessagesSection.style.display="block";let s=n.map(i=>`
        <div class="palette-item" data-jump-message="${l(i.id)}">
          <div class="palette-item-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="palette-item-content">
            <div class="palette-item-title">${l(i.from)}</div>
            <div class="palette-item-subtitle">${l(i.content.substring(0,60))}${i.content.length>60?"...":""}</div>
          </div>
        </div>
      `).join("");a.paletteMessagesSection.querySelectorAll(".palette-item").forEach(i=>i.remove()),a.paletteMessagesSection.insertAdjacentHTML("beforeend",s)}else a.paletteMessagesSection.style.display="none"}else a.paletteMessagesSection.style.display="none"}function I(t){S(t),a.threadPanelId.textContent=t,a.threadPanelOverlay.classList.add("visible"),a.threadMessageInput.value="",P(t),a.threadMessageInput.focus()}function H(){S(null),a.threadPanelOverlay.classList.remove("visible")}function P(t){let e=U(t);if(e.length===0){a.threadMessages.innerHTML=`
      <div class="thread-empty">
        <p>No messages in this thread yet.</p>
        <p style="font-size: 12px; margin-top: 8px;">Start the conversation below!</p>
      </div>
    `;return}let n=e.map(s=>`
      <div class="thread-message">
        <div class="thread-message-header">
          <div class="thread-message-avatar" style="background: ${h(s.from)}">
            ${f(s.from)}
          </div>
          <span class="thread-message-sender">${l(s.from)}</span>
          <span class="thread-message-time">${C(s.timestamp)}</span>
        </div>
        <div class="thread-message-body">${A(s.content)}</div>
      </div>
    `).join("");a.threadMessages.innerHTML=n,a.threadMessages.scrollTop=a.threadMessages.scrollHeight}function ue(){a.messagesList.querySelectorAll(".thread-indicator").forEach(t=>{t.style.cursor="pointer",t.addEventListener("click",e=>{e.stopPropagation();let n=t.dataset.thread;n&&I(n)})}),a.messagesList.querySelectorAll(".reply-count-badge").forEach(t=>{t.addEventListener("click",e=>{e.stopPropagation();let n=t.dataset.thread;n&&I(n)})}),a.messagesList.querySelectorAll('.message-action-btn[data-action="reply"]').forEach(t=>{t.addEventListener("click",e=>{e.stopPropagation();let n=t.closest(".message")?.getAttribute("data-id");n&&I(n)})})}var m=0,M=[];function se(t){let e=t.toLowerCase();M=r.agents.filter(s=>s.name.toLowerCase().includes(e)),m=0;let n="";("*".includes(e)||"everyone".includes(e)||"all".includes(e)||"broadcast".includes(e))&&(n+=`
      <div class="mention-autocomplete-item ${m===0&&M.length===0?"selected":""}" data-mention="*">
        <div class="agent-avatar" style="background: var(--accent-yellow);">*</div>
        <span class="mention-autocomplete-name">@everyone</span>
        <span class="mention-autocomplete-role">Broadcast to all</span>
      </div>
    `),M.forEach((s,o)=>{n+=`
      <div class="mention-autocomplete-item ${o===m?"selected":""}" data-mention="${l(s.name)}">
        <div class="agent-avatar" style="background: ${h(s.name)}">
          ${f(s.name)}
        </div>
        <span class="mention-autocomplete-name">@${l(s.name)}</span>
        <span class="mention-autocomplete-role">${l(s.role||"Agent")}</span>
      </div>
    `}),n===""&&(n='<div class="mention-autocomplete-item" style="color: var(--text-muted); cursor: default;">No matching agents</div>'),a.mentionAutocompleteList.innerHTML=n,a.mentionAutocomplete.classList.add("visible"),a.mentionAutocompleteList.querySelectorAll(".mention-autocomplete-item[data-mention]").forEach(s=>{s.addEventListener("click",()=>{let o=s.dataset.mention;o&&O(o)})})}function v(){a.mentionAutocomplete.classList.remove("visible"),M=[],m=0}function ae(){return a.mentionAutocomplete.classList.contains("visible")}function j(t){let e=a.mentionAutocompleteList.querySelectorAll(".mention-autocomplete-item[data-mention]");e.length!==0&&(e[m]?.classList.remove("selected"),t==="down"?m=(m+1)%e.length:m=(m-1+e.length)%e.length,e[m]?.classList.add("selected"),e[m]?.scrollIntoView({block:"nearest"}))}function O(t){let e=a.mentionAutocompleteList.querySelectorAll(".mention-autocomplete-item[data-mention]"),n=t;if(!n&&e.length>0&&(n=e[m]?.dataset.mention),!n){v();return}let s=a.messageInput,o=s.value,i=o.match(/^@\S*/);if(i){let d=`@${n} `;s.value=d+o.substring(i[0].length),s.selectionStart=s.selectionEnd=d.length}v(),s.focus()}function oe(){let t=a.messageInput,e=t.value,n=t.selectionStart,s=e.match(/^@(\S*)/);return s&&n<=s[0].length?s[1]:null}function pe(){let e=window.location.pathname.match(/^\/project\/([^/]+)$/);return e?{projectId:decodeURIComponent(e[1]),fromBridge:!0}:{projectId:null,fromBridge:!1}}async function ge(t){let e=document.querySelector(".workspace-name");if(e)try{let o=await fetch(`/api/project/${encodeURIComponent(t)}`);if(o.ok){let i=await o.json(),d=e.querySelector(":not(.status-dot)");d&&d.nodeType===Node.TEXT_NODE?d.textContent=i.name||t:(Array.from(e.childNodes).filter(y=>y.nodeType===Node.TEXT_NODE).forEach(y=>y.textContent=""),e.appendChild(document.createTextNode(" "+(i.name||t))))}}catch{}let n=document.getElementById("bridge-link-text"),s=document.getElementById("bridge-nav-link");n&&(n.textContent="\u2190 Back to Bridge"),s&&s.classList.add("back-to-bridge"),document.body.classList.add("project-view")}function ie(){let t=X(),{projectId:e,fromBridge:n}=pe();n&&e&&ge(e),N(()=>{Y(),G(),B(),Z()}),he(t),T()}function he(t){t.channelsList.querySelectorAll(".channel-item").forEach(e=>{e.addEventListener("click",()=>{let n=e.dataset.channel;n&&p(n)})}),t.sendBtn.addEventListener("click",re),t.messageInput.addEventListener("keydown",e=>{if(ae()){if(e.key==="Tab"||e.key==="Enter"){e.preventDefault(),O();return}if(e.key==="ArrowUp"){e.preventDefault(),j("up");return}if(e.key==="ArrowDown"){e.preventDefault(),j("down");return}if(e.key==="Escape"){e.preventDefault(),v();return}}e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),re())}),t.messageInput.addEventListener("input",()=>{t.messageInput.style.height="auto",t.messageInput.style.height=Math.min(t.messageInput.scrollHeight,200)+"px";let e=oe();e!==null?se(e):v()}),t.messageInput.addEventListener("blur",()=>{setTimeout(()=>{v()},150)}),t.boldBtn.addEventListener("click",()=>{let e=t.messageInput,n=e.selectionStart,s=e.selectionEnd,o=e.value;if(n===s){let i=o.substring(0,n),d=o.substring(s);e.value=i+"**bold**"+d,e.selectionStart=n+2,e.selectionEnd=n+6}else{let i=o.substring(0,n),d=o.substring(n,s),g=o.substring(s);e.value=i+"**"+d+"**"+g,e.selectionStart=n,e.selectionEnd=s+4}e.focus()}),t.emojiBtn.addEventListener("click",()=>{let e=["\u{1F44D}","\u{1F44E}","\u2705","\u274C","\u{1F389}","\u{1F525}","\u{1F4A1}","\u26A0\uFE0F","\u{1F4DD}","\u{1F680}"],n=e[Math.floor(Math.random()*e.length)],s=t.messageInput,o=s.selectionStart,i=s.value;s.value=i.substring(0,o)+n+i.substring(o),s.selectionStart=s.selectionEnd=o+n.length,s.focus()}),t.searchTrigger.addEventListener("click",$),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.key==="k"&&(e.preventDefault(),t.commandPaletteOverlay.classList.contains("visible")?u():$()),e.key==="Escape"&&u()}),t.commandPaletteOverlay.addEventListener("click",e=>{e.target===t.commandPaletteOverlay&&u()}),t.paletteSearch.addEventListener("input",e=>{let n=e.target;D(n.value)}),t.paletteSearch.addEventListener("keydown",ne),document.querySelectorAll(".palette-item[data-command]").forEach(e=>{e.addEventListener("click",()=>{let n=e.dataset.command;n==="bridge"?window.location.href="/bridge":n==="broadcast"?(t.messageInput.value="@* ",t.messageInput.focus()):n==="clear"&&(t.messagesList.innerHTML=""),u()})}),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.key==="b"&&(e.preventDefault(),window.location.href="/bridge")}),ee(),t.threadPanelClose.addEventListener("click",H),t.threadSendBtn.addEventListener("click",le),t.threadMessageInput.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),le())}),document.addEventListener("keydown",e=>{e.key==="Escape"&&t.threadPanelOverlay.classList.contains("visible")&&H()})}function fe(t){let n=t.trim().match(/^@(\*|[^\s]+)\s+(.+)$/s);return n?{to:n[1],message:n[2].trim()}:null}async function re(){let t=k(),e=t.messageInput.value.trim();if(!e)return;let n=fe(e);if(!n){alert('Message must start with @recipient (e.g., "@Lead hello" or "@* broadcast")');return}let{to:s,message:o}=n;t.sendBtn.disabled=!0;let i=await w(s,o);i.success?(t.messageInput.value="",t.messageInput.style.height="auto"):alert(i.error),t.sendBtn.disabled=!1}async function le(){let t=k(),e=t.threadMessageInput.value.trim(),n=r.currentThread;if(!e||!n)return;t.threadSendBtn.disabled=!0;let s=await w("*",e,n);s.success?(t.threadMessageInput.value="",P(n)):alert(s.error),t.threadSendBtn.disabled=!1}typeof document<"u"&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",ie):ie());export{ie as initApp};
//# sourceMappingURL=app.js.map
