var i={agents:[],messages:[],currentChannel:"general",isConnected:!1,ws:null,reconnectAttempts:0},d=[];function x(e){return d.push(e),()=>{let t=d.indexOf(e);t>-1&&d.splice(t,1)}}function m(){d.forEach(e=>e())}function M(e){i.agents=e,m()}function C(e){i.messages=e,m()}function b(e){i.currentChannel=e,m()}function f(e){i.isConnected=e,e&&(i.reconnectAttempts=0),m()}function T(){i.reconnectAttempts++}function w(e){i.ws=e}function A(){let{messages:e,currentChannel:t}=i;return t==="general"?e:t==="broadcasts"?e.filter(n=>n.to==="*"):e.filter(n=>n.from===t||n.to===t)}var D=null;function h(){let e=window.location.protocol==="https:"?"wss:":"ws:",t=new WebSocket(`${e}//${window.location.host}/ws`);t.onopen=()=>{f(!0)},t.onclose=()=>{f(!1);let n=Math.min(1e3*Math.pow(2,i.reconnectAttempts),3e4);T(),setTimeout(h,n)},t.onerror=n=>{console.error("WebSocket error:",n)},t.onmessage=n=>{try{let s=JSON.parse(n.data);V(s)}catch(s){console.error("Failed to parse message:",s)}},w(t)}function V(e){e.agents&&M(e.agents),e.messages&&C(e.messages),D&&D(e)}async function H(e,t){try{let n=await fetch("/api/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:e,message:t})}),s=await n.json();return n.ok&&s.success?{success:!0}:{success:!1,error:s.error||"Failed to send message"}}catch{return{success:!1,error:"Network error - could not send message"}}}function p(e){if(!e)return!1;let t=Date.parse(e);return Number.isNaN(t)?!1:Date.now()-t<3e4}function r(e){if(!e)return"";let t=document.createElement("div");return t.textContent=e,t.innerHTML}function $(e){return new Date(e).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}function k(e){let t=new Date(e),n=new Date,s=new Date(n);return s.setDate(s.getDate()-1),t.toDateString()===n.toDateString()?"Today":t.toDateString()===s.toDateString()?"Yesterday":t.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"})}function u(e){let t=["#e01e5a","#2bac76","#e8a427","#1264a3","#7c3aed","#0d9488","#dc2626","#9333ea","#ea580c","#0891b2"],n=0;for(let s=0;s<e.length;s++)n=e.charCodeAt(s)+((n<<5)-n);return t[Math.abs(n)%t.length]}function g(e){return e.substring(0,2).toUpperCase()}function I(e){if(!e)return"";let t=r(e);return t=t.replace(/```([\s\S]*?)```/g,"<pre>$1</pre>"),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t}var a;function B(){return a={connectionDot:document.getElementById("connection-dot"),channelsList:document.getElementById("channels-list"),agentsList:document.getElementById("agents-list"),messagesList:document.getElementById("messages-list"),currentChannelName:document.getElementById("current-channel-name"),channelTopic:document.getElementById("channel-topic"),onlineCount:document.getElementById("online-count"),targetSelect:document.getElementById("target-select"),messageInput:document.getElementById("message-input"),sendBtn:document.getElementById("send-btn"),searchTrigger:document.getElementById("search-trigger"),commandPaletteOverlay:document.getElementById("command-palette-overlay"),paletteSearch:document.getElementById("palette-search"),paletteResults:document.getElementById("palette-results"),paletteAgentsSection:document.getElementById("palette-agents-section"),paletteMessagesSection:document.getElementById("palette-messages-section"),typingIndicator:document.getElementById("typing-indicator")},a}function O(){return a}function j(){i.isConnected?a.connectionDot.classList.remove("offline"):a.connectionDot.classList.add("offline")}function P(){let e=i.agents.map(t=>{let s=p(t.lastSeen||t.lastActive)?"online":"";return`
      <li class="channel-item ${i.currentChannel===t.name?"active":""}" data-agent="${r(t.name)}">
        <div class="agent-avatar" style="background: ${u(t.name)}">
          ${g(t.name)}
          <span class="presence-indicator ${s}"></span>
        </div>
        <span class="channel-name">${r(t.name)}</span>
      </li>
    `}).join("");a.agentsList.innerHTML=e||'<li class="channel-item" style="color: var(--text-muted); cursor: default;">No agents connected</li>',a.agentsList.querySelectorAll(".channel-item[data-agent]").forEach(t=>{t.addEventListener("click",()=>{let n=t.dataset.agent;n&&v(n)})}),W()}function y(){let e=A();if(e.length===0){a.messagesList.innerHTML=`
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="empty-state-title">No messages yet</div>
        <div class="empty-state-text">
          ${i.currentChannel==="general"?"Messages between agents will appear here":i.currentChannel==="broadcasts"?"Broadcast messages will appear here":`Messages with ${i.currentChannel} will appear here`}
        </div>
      </div>
    `;return}let t="",n=null;e.forEach(o=>{let l=new Date(o.timestamp).toDateString();l!==n&&(t+=`
        <div class="date-divider">
          <span class="date-divider-text">${k(o.timestamp)}</span>
        </div>
      `,n=l);let S=o.to==="*",z=u(o.from);t+=`
      <div class="message ${S?"broadcast":""}" data-id="${r(o.id)}">
        <div class="message-avatar" style="background: ${z}">
          ${g(o.from)}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">${r(o.from)}</span>
            <span class="message-recipient">
              to <span class="target">${S?"everyone":r(o.to)}</span>
            </span>
            <span class="message-timestamp">${$(o.timestamp)}</span>
          </div>
          <div class="message-body">${I(o.content)}</div>
          ${o.thread?`
            <div class="thread-indicator" data-thread="${r(o.thread)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Thread: ${r(o.thread)}
            </div>
          `:""}
        </div>
        <div class="message-actions">
          <button class="message-action-btn" title="Reply in thread">
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
    `}),a.messagesList.innerHTML=t;let s=a.messagesList.parentElement;s&&(s.scrollTop=s.scrollHeight)}function v(e){b(e),a.channelsList.querySelectorAll(".channel-item").forEach(n=>{n.classList.toggle("active",n.dataset.channel===e)}),a.agentsList.querySelectorAll(".channel-item").forEach(n=>{n.classList.toggle("active",n.dataset.agent===e)});let t=document.querySelector(".channel-header-name .prefix");if(e==="general")a.currentChannelName.innerHTML="general",a.channelTopic.textContent="All agent communications",t&&(t.textContent="#");else if(e==="broadcasts")a.currentChannelName.innerHTML="broadcasts",a.channelTopic.textContent="Messages sent to everyone",t&&(t.textContent="#");else{a.currentChannelName.innerHTML=r(e);let n=i.agents.find(s=>s.name===e);a.channelTopic.textContent=n?.status||"Direct messages",t&&(t.textContent="@"),a.targetSelect.value=e}a.messageInput.placeholder=e==="general"||e==="broadcasts"?`Message #${e}`:`Message ${e}`,y()}function N(){let e=a.targetSelect.value,t=i.agents.map(n=>`<option value="${r(n.name)}">${r(n.name)}</option>`).join("");a.targetSelect.innerHTML=`
    <option value="">Select recipient...</option>
    <option value="*">Everyone (broadcast)</option>
    ${t}
  `,e&&(e==="*"||i.agents.some(n=>n.name===e))&&(a.targetSelect.value=e)}function q(){let e=i.agents.filter(t=>p(t.lastSeen||t.lastActive)).length;a.onlineCount.textContent=`${e} online`}function W(){let e=i.agents.map(s=>{let o=p(s.lastSeen||s.lastActive);return`
      <div class="palette-item" data-jump-agent="${r(s.name)}">
        <div class="palette-item-icon">
          <div class="agent-avatar" style="background: ${u(s.name)}; width: 20px; height: 20px; font-size: 9px;">
            ${g(s.name)}
            <span class="presence-indicator ${o?"online":""}"></span>
          </div>
        </div>
        <div class="palette-item-content">
          <div class="palette-item-title">${r(s.name)}</div>
          <div class="palette-item-subtitle">${o?"Online":"Offline"}</div>
        </div>
      </div>
    `}).join(""),t=a.paletteAgentsSection;t.querySelectorAll(".palette-item").forEach(s=>s.remove()),t.insertAdjacentHTML("beforeend",e),t.querySelectorAll(".palette-item[data-jump-agent]").forEach(s=>{s.addEventListener("click",()=>{let o=s.dataset.jumpAgent;o&&(v(o),c())})})}function E(){a.commandPaletteOverlay.classList.add("visible"),a.paletteSearch.value="",a.paletteSearch.focus(),L("")}function c(){a.commandPaletteOverlay.classList.remove("visible")}function L(e){let t=e.toLowerCase();if(document.querySelectorAll(".palette-item[data-command]").forEach(n=>{let o=n.querySelector(".palette-item-title")?.textContent?.toLowerCase()||"";n.style.display=o.includes(t)?"flex":"none"}),document.querySelectorAll(".palette-item[data-jump-agent]").forEach(n=>{let s=n.dataset.jumpAgent?.toLowerCase()||"";n.style.display=s.includes(t)?"flex":"none"}),t.length>=2){let n=i.messages.filter(s=>s.content.toLowerCase().includes(t)).slice(0,5);if(n.length>0){a.paletteMessagesSection.style.display="block";let s=n.map(l=>`
        <div class="palette-item" data-jump-message="${r(l.id)}">
          <div class="palette-item-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="palette-item-content">
            <div class="palette-item-title">${r(l.from)}</div>
            <div class="palette-item-subtitle">${r(l.content.substring(0,60))}${l.content.length>60?"...":""}</div>
          </div>
        </div>
      `).join("");a.paletteMessagesSection.querySelectorAll(".palette-item").forEach(l=>l.remove()),a.paletteMessagesSection.insertAdjacentHTML("beforeend",s)}else a.paletteMessagesSection.style.display="none"}else a.paletteMessagesSection.style.display="none"}function R(){let e=B();x(()=>{j(),P(),y(),N(),q()}),F(e),h()}function F(e){e.channelsList.querySelectorAll(".channel-item").forEach(t=>{t.addEventListener("click",()=>{let n=t.dataset.channel;n&&v(n)})}),e.sendBtn.addEventListener("click",K),e.messageInput.addEventListener("keydown",t=>{t.key==="Enter"&&(t.ctrlKey||t.metaKey)&&(t.preventDefault(),K())}),e.messageInput.addEventListener("input",()=>{e.messageInput.style.height="auto",e.messageInput.style.height=Math.min(e.messageInput.scrollHeight,200)+"px"}),e.searchTrigger.addEventListener("click",E),document.addEventListener("keydown",t=>{(t.ctrlKey||t.metaKey)&&t.key==="k"&&(t.preventDefault(),e.commandPaletteOverlay.classList.contains("visible")?c():E()),t.key==="Escape"&&c()}),e.commandPaletteOverlay.addEventListener("click",t=>{t.target===e.commandPaletteOverlay&&c()}),e.paletteSearch.addEventListener("input",t=>{let n=t.target;L(n.value)}),document.querySelectorAll(".palette-item[data-command]").forEach(t=>{t.addEventListener("click",()=>{let n=t.dataset.command;n==="broadcast"?(e.targetSelect.value="*",e.messageInput.focus()):n==="clear"&&(e.messagesList.innerHTML=""),c()})})}async function K(){let e=O(),t=e.targetSelect.value,n=e.messageInput.value.trim();if(!t){alert("Please select a recipient");return}if(!n)return;e.sendBtn.disabled=!0;let s=await H(t,n);s.success?(e.messageInput.value="",e.messageInput.style.height="auto"):alert(s.error),e.sendBtn.disabled=!1}typeof document<"u"&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",R):R());export{R as initApp};
//# sourceMappingURL=app.js.map
