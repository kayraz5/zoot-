import { BRAND, DEFAULT_COVER, onColor } from '../../model/services/brand.js'

// Canvas drawings for each passport page (512×716). The passport turns them into page images for flipbook-vue.

export const PAGE_W = 512
export const PAGE_H = 716
const INK = BRAND.ink
const MUTED = '#8a7f5a'

// Recolour a one-colour image (the otter logo)
function tinted(img, color) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}

// Seeded random numbers, so a stamp looks the same every time it's drawn
function seededRandom(seed) {
  let state = [...String(seed)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Page background with wavy security lines. Left pages have the spine on their right edge.
function paper(ctx, tint = '#fffbea', left = false) {
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  ctx.save()
  ctx.globalAlpha = 0.3
  ctx.strokeStyle = '#f2c200'
  ctx.lineWidth = 1
  for (let line = 0; line < 14; line++) {
    ctx.beginPath()
    for (let x = 0; x <= PAGE_W; x += 6) {
      const y = 90 + line * 46 + Math.sin(x / 38 + line) * 14 + Math.sin(x / 11 + line * 2) * 3
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()

  // Spine shadow
  const shadowX = left ? PAGE_W - 40 : 0
  const gradient = ctx.createLinearGradient(left ? PAGE_W : 0, 0, left ? PAGE_W - 40 : 40, 0)
  gradient.addColorStop(0, 'rgba(0,0,0,0.14)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(shadowX, 0, 40, PAGE_H)
}

function pageNumber(ctx, number, left) {
  ctx.fillStyle = MUTED
  ctx.font = '700 16px Poppins, sans-serif'
  ctx.textAlign = left ? 'left' : 'right'
  ctx.fillText(String(number), left ? 28 : PAGE_W - 28, PAGE_H - 24)
}

// Rubber-stamp texture: erase random specks from what was just drawn
function speckle(ctx, cx, cy, radius, seed) {
  const random = seededRandom(seed)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 120; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * radius
    ctx.globalAlpha = 0.2 + random() * 0.5
    ctx.beginPath()
    ctx.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, 0.6 + random() * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// Round (or square) ink stamp with a glyph, label and small text underneath
/**
 * Short label for a place's chop: drops the area name it starts with ("Tiong Bahru Market" → "MARKET"),
 * then keeps whole words up to 14 characters ("Maxwell Food Centre" → "MAXWELL FOOD").
 */
export function chopLabel(name, areaId = '') {
  let words = name.replace(/\(.*?\)/g, '').split(/[\s,&/–-]+/).filter(Boolean)
  const areaWords = areaId.toLowerCase().split(/\s+/)
  const startsWithArea = areaWords.every((word, i) => words[i]?.toLowerCase() === word)
  if (startsWithArea && words.length > areaWords.length) words = words.slice(areaWords.length)

  const kept = [words[0] || name]
  for (const word of words.slice(1)) {
    if ([...kept, word].join(' ').length > 14) break
    kept.push(word)
  }
  // Don't end on a filler word ("Satay by the Bay" → "SATAY", not "SATAY BY THE")
  while (kept.length > 1 && /^(by|the|of|and|at|on|in|a)$/i.test(kept.at(-1))) kept.pop()
  return kept.join(' ').toUpperCase()
}

// Drawn on its own canvas first, so the speckle only knocks ink out of the chop, not holes in the page
export function drawChop(ctx, options) {
  const size = Math.ceil(options.r * 2.6)
  const layer = document.createElement('canvas')
  layer.width = layer.height = size
  drawChopInk(layer.getContext('2d'), { ...options, x: size / 2, y: size / 2 })
  ctx.drawImage(layer, options.x - size / 2, options.y - size / 2)
}

function drawChopInk(ctx, { x, y, r, ink, glyph, label, sub, seed, alpha = 0.9, square = false }) {
  const random = seededRandom(seed)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((random() - 0.5) * 0.5)
  ctx.globalAlpha = alpha
  ctx.strokeStyle = ink
  ctx.fillStyle = ink

  // Outer and inner border
  ctx.lineWidth = r * 0.08
  ctx.beginPath()
  if (square) ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.18)
  else ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.lineWidth = r * 0.03
  ctx.beginPath()
  if (square) ctx.roundRect(-r * 0.84, -r * 0.84, r * 1.68, r * 1.68, r * 0.12)
  else ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(r * 0.72)}px Fredoka, serif`
  ctx.fillText(glyph, 0, -r * 0.12)
  if (label) {
    ctx.font = `800 ${Math.max(9, Math.round(r * 0.2))}px Poppins, sans-serif`
    ctx.fillText(label.toUpperCase().slice(0, 16), 0, r * 0.45)
  }
  if (sub) {
    ctx.font = `700 ${Math.max(8, Math.round(r * 0.16))}px Poppins, sans-serif`
    ctx.fillText(sub, 0, r * 0.66)
  }
  ctx.restore()
  speckle(ctx, x, y, r * 1.05, seed)
}

export function drawCover(ctx, { color = DEFAULT_COVER, name = 'Field Traveller', otter = null }) {
  const foil = onColor(color)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  // Grain so the cover looks like card, not a flat fill
  const random = seededRandom(color)
  ctx.globalAlpha = 0.05
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = random() > 0.5 ? '#000' : '#fff'
    ctx.fillRect(random() * PAGE_W, random() * PAGE_H, 2, 2)
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = foil
  ctx.strokeStyle = foil
  ctx.textAlign = 'center'

  // Logo: otter over "zoot"
  if (otter) {
    const width = 150
    const height = (width * (otter.naturalHeight || otter.height)) / (otter.naturalWidth || otter.width)
    ctx.drawImage(tinted(otter, foil), PAGE_W / 2 - width / 2 - 6, 62, width, height)
  }
  ctx.font = '700 104px Fredoka, sans-serif'
  ctx.fillText('zoot', PAGE_W / 2, 214)
  ctx.font = '800 19px Poppins, sans-serif'
  ctx.fillText('P A S S P O R T', PAGE_W / 2, 254)

  // Globe emblem
  const cx = PAGE_W / 2
  const cy = 408
  const r = 96
  ctx.lineWidth = 7
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke()
  for (const widthRatio of [0.45, 0.82]) {
    ctx.beginPath(); ctx.ellipse(cx, cy, r * widthRatio, r, 0, 0, Math.PI * 2); ctx.stroke()
  }
  for (const offset of [-0.5, 0.5]) {
    const halfWidth = Math.sqrt(1 - offset * offset) * r
    ctx.beginPath(); ctx.moveTo(cx - halfWidth, cy + offset * r); ctx.lineTo(cx + halfWidth, cy + offset * r); ctx.stroke()
  }

  ctx.font = '800 20px Poppins, sans-serif'
  ctx.fillText(name.toUpperCase().slice(0, 24), PAGE_W / 2, 572)
  ctx.font = '700 15px Fredoka, sans-serif'
  ctx.fillText('SHORT LAYOVER, JUST ZOOT!', PAGE_W / 2, 604)

  // Chip symbol
  ctx.lineWidth = 4
  ctx.strokeRect(PAGE_W / 2 - 22, 636, 44, 30)
  ctx.beginPath(); ctx.arc(PAGE_W / 2, 651, 8, 0, Math.PI * 2); ctx.stroke()

  // Outline so light covers still have an edge
  ctx.lineWidth = 10
  ctx.strokeStyle = INK
  ctx.strokeRect(5, 5, PAGE_W - 10, PAGE_H - 10)
}

// Identity page. For the machine-readable line: `nationality` is the passport country (3-letter code, e.g. DNK)
// and `entry` ({ yymmdd, code }) the latest trip; either can be null
export function drawIdentity(ctx, { name, style, level, title, xp, stamps, chops, color, nationality = null, entry = null }) {
  paper(ctx, '#fff8dc', true)
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.font = '800 15px Poppins, sans-serif'
  ctx.fillText('IDENTITY · TRAVELLER DATA', 44, 64)

  // Photo box with a silhouette
  const photoColor = color || DEFAULT_COVER
  ctx.fillStyle = photoColor
  ctx.fillRect(44, 96, 150, 190)
  ctx.fillStyle = onColor(photoColor)
  ctx.beginPath()
  ctx.arc(119, 170, 38, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(74, 216, 90, 70)
  ctx.lineWidth = 5
  ctx.strokeStyle = INK
  ctx.strokeRect(44, 96, 150, 190)

  const field = (label, value, y) => {
    ctx.fillStyle = MUTED
    ctx.font = '700 12px Poppins, sans-serif'
    ctx.fillText(label, 216, y)
    ctx.fillStyle = INK
    ctx.font = '700 22px Fredoka, sans-serif'
    ctx.fillText(String(value).slice(0, 18), 216, y + 26)
  }
  field('NAME', name, 110)
  field('TRAVEL STYLE', style, 170)
  field('RANK', `L${level} ${title}`, 230)
  field('EXPERIENCE', `${xp} XP`, 290)

  ctx.fillStyle = MUTED
  ctx.font = '700 12px Poppins, sans-serif'
  ctx.fillText('ISSUED AT', 44, 350)
  ctx.fillText('STAMPS', 216, 350)
  ctx.fillText('CHOPS', 360, 350)
  ctx.fillStyle = INK
  ctx.font = '700 22px Fredoka, sans-serif'
  ctx.fillText('SINGAPORE', 44, 376)
  ctx.fillText(String(stamps), 216, 376)
  ctx.fillText(String(chops), 360, 376)

  // Signature
  ctx.strokeStyle = BRAND.pink
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let x = 44; x < 260; x += 4) ctx.lineTo(x, 446 + Math.sin(x / 9) * 8 + Math.sin(x / 23) * 6)
  ctx.stroke()
  ctx.fillStyle = MUTED
  ctx.font = '700 11px Poppins, sans-serif'
  ctx.fillText('HOLDER SIGNATURE', 44, 476)

  // Machine-readable strip at the bottom
  ctx.fillStyle = BRAND.yellow
  ctx.fillRect(0, PAGE_H - 150, PAGE_W, 110)
  ctx.fillStyle = INK
  // 40 characters a line (a real passport's are 44)
  const MRZ_WIDTH = 40
  ctx.font = '600 19px "Courier New", monospace'
  const mrzName = (name || 'TRAVELLER').toUpperCase().replace(/[^A-Z]/g, '<').slice(0, MRZ_WIDTH - 5)
  ctx.fillText(`P<ZOT${mrzName}`.padEnd(MRZ_WIDTH, '<'), 30, PAGE_H - 110)
  // Nationality (like a real passport's second line), level, XP, then the latest entry: SIN + YYMMDD and where you came in
  const mrzEntry = entry ? `SIN${entry.yymmdd}<<${entry.code.slice(0, 8)}` : 'SIN'
  const mrzLine = `${nationality || '<<<'}<<L${String(level).padStart(2, '0')}<<XP${String(xp).padStart(6, '0')}<<${mrzEntry}`
  ctx.fillText(mrzLine.padEnd(MRZ_WIDTH, '<').slice(0, MRZ_WIDTH), 30, PAGE_H - 74)
  pageNumber(ctx, 1, true)
}

// A real stamp image (public/stamps), slightly tilted like a hand stamp
function drawStampArt(ctx, img, { x, y, r, seed }) {
  const random = seededRandom(seed)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((random() - 0.5) * 0.35)
  ctx.globalAlpha = 0.95
  ctx.drawImage(img, -r, -r, r * 2, r * 2)
  ctx.restore()
}

// One page per area: title, area chop (earned at `target` places, hidden until the slam reveals it)
// and `target` place slots. `places` is every place in the area, already in display order.
// `art` has loaded stamp images ({ places: { [placeId]: img }, area: img }); without one, the chop is drawn.
export function drawAreaPage(ctx, { area, places, stampsByPlace, target, pageNo, left, revealed = true, art = { places: {}, area: null } }) {
  paper(ctx, '#fffbea', left)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.font = '800 14px Poppins, sans-serif'
  ctx.fillText('VISAS · ENTRIES · CHOPS', 44, 58)
  ctx.fillStyle = INK
  ctx.font = '700 38px Fredoka, sans-serif'
  ctx.fillText(area.id.toUpperCase(), 44, 104)

  const stampedCount = places.filter((place) => stampsByPlace[place.id]).length
  const earned = stampedCount >= target
  ctx.fillStyle = MUTED
  ctx.font = '700 15px Poppins, sans-serif'
  ctx.fillText(earned ? `${stampedCount} / ${places.length} places stamped` : `${stampedCount} / ${target} toward the area chop`, 44, 132)

  // Area chop in the top right (real artwork if there is one), or a dashed placeholder with a faint glyph
  if (earned && revealed && art.area) {
    drawStampArt(ctx, art.area, { x: 392, y: 104, r: 66, seed: area.id })
  } else if (earned && revealed) {
    drawChop(ctx, {
      x: 392, y: 104, r: 64,
      ink: area.ink, glyph: area.glyph, label: area.id, sub: 'SINGAPORE', seed: area.id, alpha: 0.88
    })
  } else {
    ctx.save()
    ctx.setLineDash([6, 7])
    ctx.strokeStyle = '#d9c36a'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(392, 104, 60, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#e6d48a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 40px Fredoka, serif'
    ctx.fillText(area.glyph, 392, 92)
    ctx.fillStyle = '#c9b25a'
    ctx.font = '800 10px Poppins, sans-serif'
    ctx.fillText('AREA CHOP', 392, 128)
    ctx.restore()
  }

  // 2 × 3 grid of place slots
  places.slice(0, target).forEach((place, i) => {
    const x = 136 + (i % 2) * 240
    const y = 262 + Math.floor(i / 2) * 140
    const stamp = stampsByPlace[place.id]

    if (stamp && art.places[place.id]) {
      drawStampArt(ctx, art.places[place.id], { x, y, r: 54, seed: place.id })
      // The artwork has the name; the date goes underneath
      ctx.fillStyle = area.ink
      ctx.textAlign = 'center'
      ctx.font = '800 11px Poppins, sans-serif'
      ctx.fillText(stamp.date, x, y + 68)
      return
    }
    if (stamp) {
      drawChop(ctx, {
        x, y, r: 52, ink: area.ink, glyph: area.glyph, label: chopLabel(place.name, area.id),
        sub: stamp.date, seed: place.id, alpha: 0.85, square: i % 3 === 1
      })
      return
    }

    ctx.save()
    ctx.setLineDash([4, 6])
    ctx.strokeStyle = '#e0cd7e'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 48, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = '#a89a66'
    ctx.textAlign = 'center'
    ctx.font = '600 13px Poppins, sans-serif'
    wrapText(ctx, place.name, x, y - 8, 96, 15)
  })

  const moreStamped = Math.max(0, stampedCount - target)
  const moreToFind = places.length - Math.max(stampedCount, target)
  const more = [moreStamped && `+${moreStamped} more stamped`, moreToFind > 0 && `${moreToFind} more to find`].filter(Boolean)
  if (more.length) {
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.font = '700 13px Poppins, sans-serif'
    ctx.fillText(more.join(' · '), PAGE_W - 40, PAGE_H - 56)
  }
  pageNumber(ctx, pageNo, left)
}

// Last page: badges, greyed out until earned
export function drawBackPage(ctx, { badges, left = true }) {
  paper(ctx, '#fff8dc', left)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.font = '800 14px Poppins, sans-serif'
  ctx.fillText('ENDORSEMENTS · BADGES', 44, 58)

  badges.forEach((badge, i) => {
    const y = 120 + i * 92
    ctx.globalAlpha = badge.earned ? 1 : 0.35

    ctx.fillStyle = badge.earned ? BRAND.yellow : '#ece4c4'
    ctx.beginPath()
    ctx.arc(80, y, 30, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = INK
    ctx.stroke()

    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.font = '700 26px Fredoka, sans-serif'
    ctx.fillText(badge.glyph, 80, y + 9)

    ctx.textAlign = 'left'
    ctx.font = '700 20px Fredoka, sans-serif'
    ctx.fillText(badge.title, 128, y - 4)
    ctx.fillStyle = MUTED
    ctx.font = '500 13px Poppins, sans-serif'
    ctx.fillText(badge.text, 128, y + 18)

    ctx.globalAlpha = 1
  })
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = ''
  let lineY = y
  for (const word of text.split(' ')) {
    const attempt = line ? line + ' ' + word : word
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, x, lineY)
      line = word
      lineY += lineHeight
    } else {
      line = attempt
    }
  }
  ctx.fillText(line, x, lineY)
}
