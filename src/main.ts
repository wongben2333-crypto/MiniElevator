// Placeholder boot — replaced in a later wave by the fixed-timestep loop.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

export {};
