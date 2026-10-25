(function () {
  var script = document.currentScript;
  var slug = script && script.getAttribute("data-form");
  if (!slug) {
    console.error("FormChat: add a data-form attribute to the script tag.");
    return;
  }

  var mode = script.getAttribute("data-mode") === "inline" ? "inline" : "floating";
  var origin = new URL(script.src).origin;
  var embedUrl = origin + "/embed/" + encodeURIComponent(slug);

  if (mode === "floating" && document.getElementById("formchat-widget")) return;

  fetch(origin + "/api/widget/" + encodeURIComponent(slug))
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (cfg) {
      if (!cfg) return;
      if (mode === "inline") mountInline();
      else mountFloating(cfg);
    })
    .catch(function () {});

  // ---------- Inline mode: the chat sits inside the page ----------
  function mountInline() {
    var target = script.getAttribute("data-target");
    var holder = target ? document.querySelector(target) : null;
    if (!holder) {
      holder = document.createElement("div");
      script.parentNode.insertBefore(holder, script.nextSibling);
    }
    if (holder.getAttribute("data-formchat")) return;
    holder.setAttribute("data-formchat", slug);

    var h = script.getAttribute("data-height") || "600px";
    if (/^\d+$/.test(h)) h += "px";

    var frame = document.createElement("iframe");
    frame.title = "Chat form";
    frame.src = embedUrl;
    frame.setAttribute("loading", "lazy");
    frame.style.cssText =
      "display:block;width:100%;max-width:100%;border:0;border-radius:16px;background:#fff;height:" + h;
    holder.appendChild(frame);
  }

  // ---------- Floating mode: bubble + popup ----------
  function mountFloating(cfg) {
    var color = cfg.color || "#8b5cf6";
    var position = script.getAttribute("data-position") || cfg.position;
    position = position === "left" ? "left" : "right";

    var svg = function (path) {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
    };
    var chatIcon = svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
    var closeIcon = svg('<path d="M18 6 6 18M6 6l12 12"/>');

    if (!document.getElementById("formchat-styles")) {
      var css = document.createElement("style");
      css.id = "formchat-styles";
      css.textContent =
        "#formchat-widget{position:fixed;bottom:20px;z-index:2147483647;font-family:system-ui,sans-serif}" +
        "#formchat-widget.right{right:20px}" +
        "#formchat-widget.left{left:20px}" +
        "#formchat-btn{width:56px;height:56px;border-radius:50%;border:0;padding:0;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s ease}" +
        "#formchat-btn:hover{transform:scale(1.06)}" +
        "#formchat-btn img{width:100%;height:100%;object-fit:cover;display:block}" +
        "#formchat-panel{position:absolute;bottom:70px;width:380px;height:560px;max-height:calc(100vh - 110px);border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.3);opacity:0;visibility:hidden;transform:translateY(12px) scale(.98);transition:opacity .2s ease,transform .2s ease,visibility .2s}" +
        "#formchat-widget.right #formchat-panel{right:0;transform-origin:bottom right}" +
        "#formchat-widget.left #formchat-panel{left:0;transform-origin:bottom left}" +
        "#formchat-widget.open #formchat-panel{opacity:1;visibility:visible;transform:none}" +
        "#formchat-panel iframe{width:100%;height:100%;border:0;display:block}" +
        "@media (max-width:480px){" +
        "#formchat-widget.open #formchat-panel{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-height:none;border-radius:0}" +
        "#formchat-widget.open #formchat-btn{position:fixed;top:10px;right:10px;width:36px;height:36px;box-shadow:none}" +
        "}" +
        "@media (prefers-reduced-motion:reduce){#formchat-panel,#formchat-btn{transition:none}}";
      document.head.appendChild(css);
    }

    var root = document.createElement("div");
    root.id = "formchat-widget";
    root.className = position;

    var panel = document.createElement("div");
    panel.id = "formchat-panel";
    var frame = document.createElement("iframe");
    frame.title = "Chat form";
    panel.appendChild(frame);

    var btn = document.createElement("button");
    btn.id = "formchat-btn";
    btn.type = "button";
    btn.style.background = color;
    btn.setAttribute("aria-controls", "formchat-panel");

    // Optional avatar on the launcher (https images only)
    var avatar = null;
    if (cfg.avatar && /^https:\/\//i.test(cfg.avatar)) {
      avatar = document.createElement("img");
      avatar.alt = "";
      avatar.src = cfg.avatar;
      avatar.onerror = function () {
        avatar = null;
        render(root.classList.contains("open"));
      };
    }

    function render(isOpen) {
      btn.innerHTML = "";
      if (isOpen) btn.innerHTML = closeIcon;
      else if (avatar) btn.appendChild(avatar);
      else btn.innerHTML = chatIcon;
      btn.setAttribute("aria-label", isOpen ? "Close chat" : "Open chat");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    var loaded = false;
    function setOpen(isOpen) {
      root.classList.toggle("open", isOpen);
      render(isOpen);
      // Only load the form the first time someone opens the chat
      if (isOpen && !loaded) {
        frame.src = embedUrl;
        loaded = true;
      }
    }

    btn.addEventListener("click", function () {
      setOpen(!root.classList.contains("open"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("open")) setOpen(false);
    });

    render(false);
    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);
  }
})();