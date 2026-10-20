(function () {
  var script = document.currentScript;
  var slug = script && script.getAttribute("data-form");
  if (!slug) {
    console.error("FormChat: add a data-form attribute to the script tag.");
    return;
  }
  if (document.getElementById("formchat-widget")) return;

  // The widget loads everything from the site that served this script
  var origin = new URL(script.src).origin;

  fetch(origin + "/api/widget/" + encodeURIComponent(slug))
    .then(function (cfg) {
  console.log("Widget config:", cfg);

  if (cfg) {
    mount(cfg);
  } else {
    console.error("Widget config is empty.");
  }
})
.catch(function (err) {
  console.error("Widget error:", err);
});

  function mount(cfg) {
    var color = cfg.color || "#8b5cf6";
    var svg = function (path) {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + "</svg>";
    };
    var chatIcon = svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
    var closeIcon = svg('<path d="M18 6 6 18M6 6l12 12"/>');

    var css = document.createElement("style");
    css.textContent =
      "#formchat-widget{position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:system-ui,sans-serif}" +
      "#formchat-btn{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25)}" +
      "#formchat-panel{display:none;position:absolute;right:0;bottom:70px;width:380px;height:560px;max-height:calc(100vh - 110px);border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.3);background:#fff}" +
      "#formchat-widget.open #formchat-panel{display:block}" +
      "#formchat-panel iframe{width:100%;height:100%;border:0;display:block}" +
      "@media (max-width:480px){" +
      "#formchat-widget.open #formchat-panel{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-height:none;border-radius:0}" +
      "#formchat-widget.open #formchat-btn{position:fixed;top:10px;right:10px;width:36px;height:36px;box-shadow:none}" +
      "}";
    document.head.appendChild(css);

    var root = document.createElement("div");
    root.id = "formchat-widget";

    var panel = document.createElement("div");
    panel.id = "formchat-panel";
    var frame = document.createElement("iframe");
    frame.title = "Chat form";
    panel.appendChild(frame);

    var btn = document.createElement("button");
    btn.id = "formchat-btn";
    btn.style.background = color;
    btn.innerHTML = chatIcon;
    btn.setAttribute("aria-label", "Open chat");

    var loaded = false;
    btn.addEventListener("click", function () {
      var isOpen = root.classList.toggle("open");
      btn.innerHTML = isOpen ? closeIcon : chatIcon;
      btn.setAttribute("aria-label", isOpen ? "Close chat" : "Open chat");
      // Only load the form the first time someone opens the chat
      if (isOpen && !loaded) {
        frame.src = origin + "/embed/" + encodeURIComponent(slug);
        loaded = true;
      }
    });

    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);
  }
})();