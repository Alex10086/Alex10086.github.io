(() => {
  if (window.alexSpringWidget || !window.SakanaWidget) return;
  const host = document.createElement("div");
  host.id = "alex-spring-widget";
  host.setAttribute("aria-label", "可拖动的弹簧挂件");
  host.title = "试着拖动头像";
  document.body.appendChild(host);
  const character = SakanaWidget.getCharacter("chisato");
  character.image = "/images/avatar.svg";
  SakanaWidget.registerCharacter("alex", character);
  window.alexSpringWidget = new SakanaWidget({ character: "alex", controls: false, size: 150 })
    .setState({ i: 0.02, d: 0.97 }).mount("#alex-spring-widget");
})();
