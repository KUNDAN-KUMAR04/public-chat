/**
 * 😀 EMOJI SUPPORT — Proper rendering on all platforms
 */

(function() {
    const style = document.createElement('style');
    style.textContent = `
        body, input, button, textarea, div, span {
            font-family:
                -apple-system, BlinkMacSystemFont, 'Segoe UI',
                'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji',
                'Segoe UI Symbol', Arial, sans-serif;
        }
    `;
    document.head.appendChild(style);
    console.log('✅ Emoji support module loaded');
})();
