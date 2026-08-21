// Colour palettes exported from the Figma variable collections
// (color-light-palitra / color-dark-palitra). Each colour defines the frame's
// semantic tint, stroke, and deep-glow (bg-blur).

export type PaletteMode = 'dark' | 'light'

export interface PaletteColor {
  key: string
  label: string
  semantic: string // bg-semantic (translucent tint / glow)
  stroke: string // border
  blur: string // bg-blur (intense glow / pill)
}

export const PALETTES: Record<PaletteMode, PaletteColor[]> = {
  light: [
    { key: 'green', label: 'Green', semantic: 'rgba(17,141,41,0.6)', stroke: '#0c8022', blur: '#0c8022' },
    { key: 'cyan', label: 'Cyan', semantic: 'rgba(0,186,121,0.9)', stroke: '#25ab7c', blur: '#00976a' },
    { key: 'blue', label: 'Blue', semantic: 'rgba(11,230,254,0.6)', stroke: '#0bb9ef', blur: '#0be6fe' },
    { key: 'dark-blue', label: 'Dark blue', semantic: 'rgba(11,141,254,0.6)', stroke: '#097be0', blur: '#0b8dfe' },
    { key: 'purple', label: 'Purple', semantic: 'rgba(122,51,255,0.6)', stroke: '#6627db', blur: '#7a33ff' },
    { key: 'purple-pink', label: 'Purple pink', semantic: 'rgba(188,74,255,0.6)', stroke: '#9e32dd', blur: '#bc4aff' },
    { key: 'magenta', label: 'Magenta', semantic: 'rgba(255,0,208,0.6)', stroke: '#da0cb4', blur: '#ff00d0' },
    { key: 'red-pink', label: 'Red pink', semantic: 'rgba(255,0,98,0.6)', stroke: '#db1963', blur: '#ff0062' },
    { key: 'red', label: 'Red', semantic: 'rgba(255,0,4,0.6)', stroke: '#e60004', blur: '#ff0004' },
    { key: 'yellow', label: 'Yellow', semantic: 'rgba(228,170,0,0.6)', stroke: '#e28a02', blur: '#e4aa00' },
  ],
  dark: [
    { key: 'green', label: 'Green', semantic: 'rgba(11,254,112,0.6)', stroke: '#09db60', blur: '#07b24f' },
    { key: 'blue', label: 'Blue', semantic: 'rgba(36,108,254,0.6)', stroke: '#1f5ddb', blur: '#194cb2' },
    { key: 'orange', label: 'Orange', semantic: 'rgba(253,117,5,0.6)', stroke: '#fd7505', blur: '#fd7505' },
    { key: 'brown', label: 'Brown', semantic: 'rgba(153,86,52,0.6)', stroke: '#b2704f', blur: '#8c5235' },
    { key: 'dark-red', label: 'Dark red', semantic: 'rgba(133,8,8,0.6)', stroke: '#b21d1d', blur: '#7d1818' },
    { key: 'pink', label: 'Pink', semantic: 'rgba(199,27,214,0.6)', stroke: '#df2dee', blur: '#c71bd6' },
    { key: 'peach', label: 'Peach', semantic: 'rgba(228,132,91,0.6)', stroke: '#ff8f5f', blur: '#ff8f5f' },
    { key: 'indigo', label: 'Indigo', semantic: 'rgba(38,51,223,0.6)', stroke: '#2633df', blur: '#2633df' },
  ],
}

export function resolveColor(mode: PaletteMode, key: string): PaletteColor {
  const list = PALETTES[mode] ?? PALETTES.dark
  return list.find((c) => c.key === key) ?? list[0]
}
