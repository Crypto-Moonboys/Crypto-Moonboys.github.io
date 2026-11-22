/* Original pixel art. Terrain draws first, then objects and actors by ground position. */
window.drawWaterfront = function drawWaterfront(ctx, rows, player, district) {
  const { tileSize: size, tiles } = district;
  const width = rows[0].length;
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
    const x = col * size;
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
        rect("#252334", x, y + 24, size, 8);
        rect("#6c667b", x, y + 24, size, 3);
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
      rect("#303242", x + 2, y + 2, 28, 28);
      rect(tiles.r.color, x + 4, y + 4, 24, 24);
      if (roadAt(col, row - 1)) rect(tiles.r.color, x + 4, y, 24, 5);
      if (roadAt(col, row + 1)) rect(tiles.r.color, x + 4, y + 27, 24, 5);
      if (roadAt(col - 1, row)) rect(tiles.r.color, x, y + 4, 5, 24);
      if (roadAt(col + 1, row)) rect(tiles.r.color, x + 27, y + 4, 5, 24);
      for (let i = 0; i < 9; i++) {
        rect(i % 2 ? "#666677" : "#353746", x + 5 + (i * 11 + seed) % 20, y + 5 + (i * 7 + seed) % 20, 4, 1);
      }
      return;
    }

    if ("hwcgsb".includes(tile)) {
      objects.push(() => building(tile, x, y));
    } else if (tile === "." && row === 2) {
      if (roadAt(col - 1, row) || roadAt(col + 1, row)) objects.push(() => lamp(x + 16, y + 21));
      else if (seed % 4 === 0) objects.push(() => mooring(x, y));
    } else if (tile === "." && (roadAt(col - 1, row) || roadAt(col + 1, row))) {
      if (seed % 4 === 0) objects.push(() => lamp(x + 22, y + 23));
      else if (seed % 5 === 1) objects.push(() => crates(x, y));
    } else if (tile === "." && seed % 11 === 3) {
      objects.push(() => tree(x, y));
    } else if (tile === "." && seed % 5 === 1) {
      rect("#34323e", x + 8, y + 8, 13, 12);
      rect("#2b303b", x + 10, y + 10, 9, 8);
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

    if (tile === "g") {
      rect("#15131e", x + 1, y + 5, 30, 23);
      rect("#684652", x + 1, y + 6, 28, 19);
      rect("#a17b77", x + 1, y + 5, 28, 2);
      for (let i = 0; i < 5; i++) rect("#442e3b", x + 1, y + 9 + i * 3, 28, 1);
      graffiti(x + 4, y + 11, Math.floor(x / size) % 2);
      return;
    }

    const roof = tiles[tile].color;
    rect("#141623", x + 1, y + 9, 30, 20);
    rect(tile === "c" ? "#504f5e" : "#554151", x + 2, y + 9, 27, 18);
    rect("#262336", x, y - 4, 31, 15);
    rect(roof, x + 2, y - 4, 27, 11);
    rect("#ffffff26", x + 2, y - 3, 27, 1);
    rect("#211e2f", x + 5, y - 1, 9, 5);
    rect("#666777", x + 5, y - 1, 8, 2);
    rect("#1d1d2a", x + 1, y + 7, 29, 4);

    if (tile === "s") {
      rect("#e15ca5", x + 2, y + 10, 26, 2);
      rect("#202131", x + 3, y + 13, 15, 11);
      rect("#633a67", x + 4, y + 14, 13, 8);
      rect("#f198c7", x + 6, y + 14, 7, 7);
      rect("#322539", x + 7, y + 15, 5, 5);
      rect("#ffc678", x + 9, y + 17, 1, 1);
      rect("#75e0d9", x + 20, y + 13, 6, 2);
      rect("#312338", x + 20, y + 16, 6, 11);
      return;
    }
    if (tile === "c") {
      for (const windowX of [5, 13, 21]) {
        rect("#292637", x + windowX, y + 13, 5, 6);
        rect("#ffc983", x + windowX + 1, y + 14, 3, 3);
      }
      rect("#272938", x + 12, y + 21, 8, 7);
      rect("#74c2b4", x + 10, y + 20, 12, 1);
      return;
    }

    rect("#292635", x + 4, y + 12, 23, 14);
    for (let i = 0; i < 5; i++) rect("#696274", x + 5, y + 13 + i * 2, 21, 1);
    if (tile === "b") graffiti(x + 5, y + 13, 1);
    else {
      rect("#db8f55", x + 5, y + 12, 5, 2);
      rect("#a48765", x + 23, y - 8, 4, 10);
      rect("#d9aa74", x + 22, y - 8, 6, 2);
    }
  }

  function graffiti(x, y, variant) {
    // Original angular letterforms that read at tile scale.
    const strokes = variant
      ? [[0,7],[4,0],[5,5],[9,1],[10,7],[14,1],[18,1],[16,4],[20,7]]
      : [[0,6],[4,1],[7,1],[5,4],[8,4],[5,8],[11,7],[14,1],[16,6],[20,1],[19,7]];
    for (const [dx, dy, color, thickness] of [[1, 1, "#231b2e", 4], [0, 0, variant ? "#74e7d0" : "#f57cad", 2]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      strokes.forEach(([sx, sy], i) => i ? ctx.lineTo(x + sx + dx, y + sy + dy) : ctx.moveTo(x + sx + dx, y + sy + dy));
      ctx.stroke();
    }
    rect(variant ? "#f99e6e" : "#f8e098", x + 17, y, 2, 1);
  }

  function crates(x, y) {
    rect("#171923", x + 8, y + 23, 17, 5);
    for (const [dx, dy] of [[8, 18], [16, 21]]) {
      rect("#976a4f", x + dx, y + dy, 8, 7);
      rect("#cb9870", x + dx, y + dy, 8, 1);
      rect("#5b3e3f", x + dx + 3, y + dy + 1, 1, 6);
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
    rect("#ffb67015", x - 9, y - 9, 20, 16);
    rect("#ffb67021", x - 5, y - 6, 12, 9);
    rect("#231f2a", x, y - 8, 2, 10);
    rect("#6f6857", x - 2, y - 13, 6, 6);
    rect("#ffe19a", x - 1, y - 12, 4, 3);
  }

  function actor() {
    const x = player.x * size + 16;
    const y = player.y * size + 22;
    rect("#1026338c", x - 6, y + 1, 15, 4);
    rect("#152b39", x - 4, y - 4, 3, 6);
    rect("#152b39", x + 2, y - 4, 3, 6);
    rect("#c17362", x - 5, y - 11, 10, 8);
    rect("#eac69e", x - 3, y - 15, 6, 5);
    rect("#39778c", x - 5, y - 17, 10, 4);
    rect("#bbf9f3", x + 5, y - 9, 4, 5);
  }

  rows.forEach((_, y) => {
    for (let x = 0; x < width; x++) terrain(tileAt(x, y), x, y);
    if (y === player.y) objects.push(actor);
  });
  objects.forEach(draw => draw());

};
