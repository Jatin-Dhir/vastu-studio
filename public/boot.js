// Paints the chosen theme before the bundle arrives, so a returning user never sees a
// flash of the other ground. Kept as a file (not inline) so the desktop shell's CSP
// can forbid inline scripts outright.
(function () {
  var theme = 'paper', accent = 'gold'
  try {
    var p = JSON.parse(localStorage.getItem('vastu-studio.theme.v2') || 'null')
    if (p) { theme = p.theme || theme; accent = p.accent || accent }
    else {
      var o = JSON.parse(localStorage.getItem('vastu-studio.theme.v1') || 'null')
      if (o && o.accent) accent = o.accent
    }
  } catch (e) { /* private mode */ }
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.accent = accent
})()
