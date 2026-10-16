// A short tap felt in the hand when something is done: a slot ticked off, a
// machine finished. It confirms without the filler having to look. Android
// phones vibrate; iPhones have no vibrate in the browser, but Safari 18 gives
// a tap when a switch flips, so a hidden one is flipped instead. Phones that
// can do neither simply stay still. Call it only from a tap's own handler.

let iosSwitch: HTMLLabelElement | null = null;

export function haptic(kind: "tick" | "success" = "tick") {
  if (typeof window === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(kind === "success" ? [14, 70, 22] : 9);
      return;
    }
    if (!iosSwitch) {
      iosSwitch = document.createElement("label");
      iosSwitch.setAttribute("aria-hidden", "true");
      iosSwitch.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.tabIndex = -1;
      input.setAttribute("switch", "");
      iosSwitch.appendChild(input);
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
    if (kind === "success") window.setTimeout(() => iosSwitch?.click(), 90);
  } catch {
    // No tap then; nothing else depends on it.
  }
}
