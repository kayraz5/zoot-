/**
 * How each rail line is named and coloured for travellers. Station order and positions
 * live in mrtNetwork.sg.json (pnpm sync:transit); this file is the hand-written part.
 * Colours are LTA's official line colours, so the map matches station signage.
 * `loop` lines have no single terminus, so directions name the next stop instead.
 */
export const LINES = {
  NS: { name: 'North South Line', colour: 'Red', hex: '#d42e12' },
  EW: { name: 'East West Line', colour: 'Green', hex: '#009645' },
  CG: { name: 'East West Line (Changi branch)', colour: 'Green', hex: '#009645' },
  NE: { name: 'North East Line', colour: 'Purple', hex: '#9900aa' },
  CC: { name: 'Circle Line', colour: 'Orange', hex: '#fa9e0d', loop: true },
  CE: { name: 'Circle Line', colour: 'Orange', hex: '#fa9e0d' },
  DT: { name: 'Downtown Line', colour: 'Blue', hex: '#005ec4' },
  TE: { name: 'Thomson-East Coast Line', colour: 'Brown', hex: '#9d5b25' },
  SE: { name: 'Sentosa Express', colour: 'Sentosa Express', hex: '#e2006a' }
}

export const BUS_HEX = '#2b9cff'
export const WALK_HEX = '#ff1dce' // the map's route pink; walking stays the "follow me" colour
