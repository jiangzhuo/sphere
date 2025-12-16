export class BackgroundManager {
  constructor(element) {
    this.element = element;
    this.currentBackground = null;
  }

  setBackground(url) {
    this.currentBackground = url;
    this.element.style.backgroundImage = `url("${url}")`;
    console.log('Background set to:', url);
  }

  setBackgroundFromFile(file) {
    const url = URL.createObjectURL(file);
    this.setBackground(url);

    // Clean up old object URL
    if (this.currentBackground && this.currentBackground.startsWith('blob:')) {
      URL.revokeObjectURL(this.currentBackground);
    }

    return url;
  }

  // Adjust background position for alignment
  setPosition(x, y) {
    this.element.style.backgroundPosition = `${x}% ${y}%`;
  }

  // Adjust background size
  setSize(size) {
    this.element.style.backgroundSize = size; // 'cover', 'contain', or custom
  }

  // Apply filters for atmosphere
  setFilter(filter) {
    this.element.style.filter = filter;
  }

  // Darken background to make sphere stand out
  darken(amount = 0.3) {
    this.element.style.filter = `brightness(${1 - amount})`;
  }
}
