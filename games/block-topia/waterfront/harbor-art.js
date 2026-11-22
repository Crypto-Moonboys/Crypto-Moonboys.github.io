/* Original pixel art. Terrain draws first, then objects and actors by ground position. */
window.drawWaterfront = function drawWaterfront(ctx, rows, player, district) {
  const { tileSize: size, tiles } = district;
  const width = rows[0].length;
  const offset = Math.floor((ctx.canvas.width - width * size) / 2);
  const rect = (color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const polygon = (color, points) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  };
  const tileAt = (x, y) => rows[y]?.[x] ?? (y < 2 ? "~" : ".");
  const roadAt = (x, y) => Boolean(tiles[tileAt(x, y)].walkable);
  const objects = [];

  function terrain(tile, col, row) {
    const x = offset + col * size;
    const y = row * size;
    const seed = (col * 73856093 ^ row * 19349663) >>> 0;
    const water = tile === "~";
    const dock = tile === "d";

    rect(water || dock ? tiles["~"].color : tiles["."].color, x, y, size, size);
    for (let i = 0; i < 8; i++) {
      const a = (seed + i * 7) % 27;
      const b = ((seed >>> 7) + i * 11) % 30;
      const shade = i % 2 ? "#ffffff16" : "#091d2740";
      if (water || dock) rect(i % 2 ? "#428aa459" : "#133042", x + a, y + b, 3 + i % 3, 1);
      else rect(shade, x + a, y + b, 2 + i % 3, 2);
    }

    if (water) {
      if (tileAt(col, row + 1) !== "~" && tileAt(col, row + 1) !== "d") {
        rect("#1b2933", x, y + 24, size, 8);
        rect("#789693", x, y + 24, size, 3);
        rect("#43787f", x, y + 21, size, 1);
        rect("#3a5157", x + (col % 2 ? 8 : 20), y + 27, 2, 5);
      }
      return;
    }

    if (dock) {
      rect("#392c2b", x + 3, y, 26, size);
      for (let i = 0; i < 8; i++) {
        rect(i % 2 ? "#a17552" : "#906244", x + 4, y + i * 4, 24, 3);
        rect("#c69864", x + 5, y + i * 4, 21, 1);
      }
      for (const post of [3, 25]) {
        rect("#3d2929", x + post, y + 5, 5, 9);
        rect("#e0b37b", x + post, y + 4, 5, 3);
      }
      return;
    }

    if (tile === "r") {
      rect("#3d585b", x + 2, y + 2, 28, 28);
      rect(tiles.r.color, x + 4, y + 4, 24, 24);
      if (roadAt(col, row - 1)) rect(tiles.r.color, x + 4, y, 24, 5);
      if (roadAt(col, row + 1)) rect(tiles.r.color, x + 4, y + 27, 24, 5);
      if (roadAt(col - 1, row)) rect(tiles.r.color, x, y + 4, 5, 24);
      if (roadAt(col + 1, row)) rect(tiles.r.color, x + 27, y + 4, 5, 24);
      for (let i = 0; i < 9; i++) {
        rect(i % 2 ? "#93a7a1" : "#506c71", x + 5 + (i * 11 + seed) % 20, y + 5 + (i * 7 + seed) % 20, 4, 1);
      }
      return;
    }

    if ("hwc".includes(tile)) {
      objects.push(() => building(tile, x, y));
    } else if (tile === "." && seed % 11 === 3) {
      objects.push(() => tree(x, y));
    } else if (tile === "." && (col < 0 || col >= width) && row === 2 && seed % 2 === 0) {
      objects.push(() => mooring(x, y));
    } else if (tile === "." && roadAt(col + 1, row) && seed % 5 === 1) {
      objects.push(() => lamp(x + 22, y + 23));
    } else if (tile === "." && seed % 9 === 1) {
      rect("#58775d", x + 12, y + 12, 4, 3);
      rect("#749263", x + 16, y + 10, 2, 4);
    }
  }

  function building(tile, x, y) {
    rect("#0c252c83", x + 4, y + 24, 29, 7);
    if (tile === "h") {
      rect("#2e4449", x + 5, y + 23, 22, 6);
      rect("#8b8580", x + 8, y - 13, 16, 38);
      rect(tiles.h.color, x + 10, y - 13, 10, 38);
      rect("#b96853", x + 8, y + 1, 16, 5);
      rect("#433942", x + 12, y + 17, 7, 8);
      rect("#45525c", x + 5, y - 23, 22, 13);
      rect("#ffe5a2", x + 8, y - 21, 16, 7);
      rect("#81979b", x + 13, y - 21, 2, 7);
      polygon("#943e36", [[x+3,y-23],[x+16,y-34],[x+29,y-23]]);
      rect("#efaa72", x + 12, y - 29, 8, 2);
      return;
    }

    const roof = tiles[tile].color;
    rect(tile === "w" ? "#75544d" : "#55706e", x + 3, y + 7, 26, 21);
    rect("#c4a77e", x + 4, y + 12, 21, 13);
    polygon("#182d36", [[x+1,y+13],[x+7,y-1],[x+25,y-1],[x+31,y+13],[x+31,y+16],[x+1,y+16]]);
    polygon(roof, [[x+2,y+12],[x+8,y],[x+24,y],[x+30,y+12]]);
    for (let i = 0; i < 3; i++) rect("#ffffff36", x + 8 - i, y + 2 + i * 3, 15 + i * 2, 1);
    rect("#392e37", x + 13, y + 18, 7, 10);
    rect("#594743", x + 5, y + 17, 6, 6);
    rect("#ffda87", x + 6, y + 18, 4, 4);
    if (tile === "w") {
      rect("#463e43", x + 23, y - 5, 4, 12);
      rect("#a18b72", x + 22, y - 5, 6, 2);
      rect("#c19054", x + 25, y + 23, 5, 5);
    }
  }

  function tree(x, y) {
    rect("#152e327a", x + 7, y + 25, 23, 5);
    rect("#85614a", x + 13, y + 15, 5, 13);
    polygon("#24463f", [[x+3,y+18],[x+9,y+4],[x+18,y+1],[x+28,y+9],[x+28,y+21],[x+19,y+24],[x+6,y+22]]);
    polygon("#537a5d", [[x+5,y+16],[x+10,y+5],[x+19,y+4],[x+24,y+9],[x+21,y+16],[x+10,y+19]]);
    rect("#8d9c60", x + 10, y + 8, 7, 2);
  }

  function mooring(x, y) {
    rect("#263d40", x + 3, y + 3, 25, 9);
    rect("#8f8f75", x + 3, y + 3, 25, 3);
    for (const dx of [5, 23]) {
      rect("#685640", x + dx, y + 2, 4, 8);
      rect("#cfab6d", x + dx, y + 1, 4, 3);
    }
    rect("#372f30", x + 7, y + 16, 10, 9);
    rect("#a37d52", x + 8, y + 16, 8, 6);
    rect("#d4a46c", x + 9, y + 17, 6, 1);
  }

  function lamp(x, y) {
    rect("#21383c", x, y - 8, 2, 10);
    rect("#6f6857", x - 2, y - 13, 6, 6);
    rect("#ffe19a", x - 1, y - 12, 4, 3);
  }

  function actor() {
    const x = offset + player.x * size + 16;
    const y = player.y * size + 22;
    rect("#1026338c", x - 6, y + 1, 15, 4);
    rect("#152b39", x - 4, y - 4, 3, 6);
    rect("#152b39", x + 2, y - 4, 3, 6);
    rect("#c17362", x - 5, y - 11, 10, 8);
    rect("#eac69e", x - 3, y - 15, 6, 5);
    rect("#39778c", x - 5, y - 17, 10, 4);
    rect("#bbf9f3", x + 5, y - 9, 4, 5);
  }

  const firstColumn = Math.floor(-offset / size);
  const lastColumn = Math.ceil((ctx.canvas.width - offset) / size);
  rows.forEach((_, y) => {
    for (let x = firstColumn; x < lastColumn; x++) terrain(tileAt(x, y), x, y);
    if (y === player.y) objects.push(actor);
  });
  objects.forEach(draw => draw());

  return offset;
};
