# Missing stamp art

Snapshot of `public/stamps` against `src/model/data/places.sg.json`.

## Coverage

- Places: **68 / 131** have art (63 missing).
- Area chops: **9 / 14** have art.

## Missing area chops

These are the five areas that still use the drawn fallback. Name the file exactly after the area id.

| Area | Suggested file |
| --- | --- |
| Changi | `Changi.png` |
| Tiong Bahru | `Tiong_Bahru.png` |
| Tanglin | `Tanglin.png` |
| West | `West.png` |
| North | `North.png` |

## How naming works

Drop PNGs into `public/stamps/`; no code or manifest update is needed. The matcher compares normalised names:

1. exact name — `ArtScience Museum` → `ArtScience_Museum.png`
2. one name is a prefix of the other — `Mount Faber Peak` → `Mount_Faber.png`
3. meaningful-word containment — `Sun Yat Sen Nanyang Memorial Hall` → `Sun_Yat_Sen_Memorial_Hall.png`

Punctuation, `&`, apostrophes, `@`, parentheses and case are normalised. Area stamps are kept out of place matching, so a place cannot borrow a district stamp.

## Missing place stamps

Suggested filenames are only a convention; any name that normalises to the place name will match.

### Changi (6 missing)

- [ ] Jewel Rain Vortex → `Jewel_Rain_Vortex.png`
- [ ] Canopy Park, Jewel → `Canopy_Park_Jewel.png`
- [ ] Shiseido Forest Valley → `Shiseido_Forest_Valley.png`
- [ ] Changi Village Hawker Centre → `Changi_Village_Hawker_Centre.png`
- [ ] Changi Point Coastal Boardwalk → `Changi_Point_Coastal_Boardwalk.png`
- [ ] Changi Beach Park → `Changi_Beach_Park.png`

### East Coast (7 missing)

- [ ] East Coast Lagoon Food Village → `East_Coast_Lagoon_Food_Village.png`
- [ ] Koon Seng Road Peranakan Houses → `Koon_Seng_Road_Peranakan_Houses.png`
- [ ] 328 Katong Laksa → `328_Katong_Laksa.png`
- [ ] Kim Choo Kueh Chang → `Kim_Choo_Kueh_Chang.png`
- [ ] Geylang Serai Market → `Geylang_Serai_Market.png`
- [ ] Old Airport Road Food Centre → `Old_Airport_Road_Food_Centre.png`
- [ ] Eurasian Heritage Gallery → `Eurasian_Heritage_Gallery.png`

### Marina Bay (8 missing)

- [ ] Supertree Grove → `Supertree_Grove.png`
- [ ] Cloud Forest → `Cloud_Forest.png`
- [ ] Flower Dome → `Flower_Dome.png`
- [ ] Garden Rhapsody light show → `Garden_Rhapsody_light_show.png`
- [ ] Satay by the Bay → `Satay_by_the_Bay.png`
- [ ] Spectra light & water show → `Spectra_light_and_water_show.png`
- [ ] Helix Bridge → `Helix_Bridge.png`
- [ ] Makansutra Gluttons Bay → `Makansutra_Gluttons_Bay.png`

### Civic District (6 missing)

- [ ] Cavenagh Bridge & Fullerton → `Cavenagh_Bridge_and_Fullerton.png`
- [ ] Boat Quay → `Boat_Quay.png`
- [ ] Clarke Quay → `Clarke_Quay.png`
- [ ] Old Hill Street Police Station → `Old_Hill_Street_Police_Station.png`
- [ ] Raffles Statue → `Raffles_Statue.png`
- [ ] Children's Museum Singapore → `Childrens_Museum_Singapore.png`

### Chinatown (9 missing)

- [ ] Maxwell Food Centre → `Maxwell_Food_Centre.png`
- [ ] Chinatown Complex Food Centre → `Chinatown_Complex_Food_Centre.png`
- [ ] Ann Siang Hill & Club Street → `Ann_Siang_Hill_and_Club_Street.png`
- [ ] Pagoda Street Market → `Pagoda_Street_Market.png`
- [ ] Amoy Street Food Centre → `Amoy_Street_Food_Centre.png`
- [ ] Hong Lim Food Centre → `Hong_Lim_Food_Centre.png`
- [ ] Ya Kun Kaya Toast (Far East Square) → `Ya_Kun_Kaya_Toast_Far_East_Square.png`
- [ ] Keong Saik Road → `Keong_Saik_Road.png`
- [ ] People's Park Complex → `Peoples_Park_Complex.png`

### Tiong Bahru (2 missing)

- [ ] Tiong Bahru Market → `Tiong_Bahru_Market.png`
- [ ] Tiong Bahru Art Deco Estate → `Tiong_Bahru_Art_Deco_Estate.png`

### Kampong Glam (6 missing)

- [ ] Haji Lane → `Haji_Lane.png`
- [ ] Arab Street → `Arab_Street.png`
- [ ] Zam Zam (North Bridge Road) → `Zam_Zam_North_Bridge_Road.png`
- [ ] Bugis Street → `Bugis_Street.png`
- [ ] Kwan Im Thong Hood Cho Temple → `Kwan_Im_Thong_Hood_Cho_Temple.png`
- [ ] Hill Street Tai Hwa Pork Noodle → `Hill_Street_Tai_Hwa_Pork_Noodle.png`

### Little India (4 missing)

- [ ] Tekka Centre → `Tekka_Centre.png`
- [ ] House of Tan Teng Niah → `House_of_Tan_Teng_Niah.png`
- [ ] Mustafa Centre → `Mustafa_Centre.png`
- [ ] Indian Heritage Centre → `Indian_Heritage_Centre.png`

### Orchard (4 missing)

- [ ] ION Orchard → `ION_Orchard.png`
- [ ] Ngee Ann City → `Ngee_Ann_City.png`
- [ ] Emerald Hill Road → `Emerald_Hill_Road.png`
- [ ] Newton Food Centre → `Newton_Food_Centre.png`

### Tanglin (3 missing)

- [ ] National Orchid Garden → `National_Orchid_Garden.png`
- [ ] Dempsey Hill → `Dempsey_Hill.png`
- [ ] Adam Road Food Centre → `Adam_Road_Food_Centre.png`

### HarbourFront (1 missing)

- [ ] VivoCity → `VivoCity.png`

### Sentosa (2 missing)

- [ ] Siloso Beach, Sentosa → `Siloso_Beach_Sentosa.png`
- [ ] Palawan Beach & Southernmost Point → `Palawan_Beach_and_Southernmost_Point.png`

### West (2 missing)

- [ ] Haw Par Villa → `Haw_Par_Villa.png`
- [ ] Holland Village → `Holland_Village.png`

### North (3 missing)

- [ ] MacRitchie TreeTop Walk → `MacRitchie_TreeTop_Walk.png`
- [ ] Former Ford Factory → `Former_Ford_Factory.png`
- [ ] River Wonders → `River_Wonders.png`

## Existing art that is currently unused

You may be able to reuse these without drawing new stamps:

| File | Note |
| --- | --- |
| `Old_Ford_Factory.png` | Rename to `Former_Ford_Factory.png` (the catalog name) to use it. |
| `River_Safari.png` | Rename to `River_Wonders.png` (the current attraction name). |
| `Eurasian_Heritage_Centre.png` | If it depicts the same venue, rename to `Eurasian_Heritage_Gallery.png`. |
| `Gardens_by_the_Bay.png` | Not a catalog place. Could be used as a generic stamp for `Supertree_Grove`, `Cloud_Forest`, `Flower_Dome`, `Garden_Rhapsody_light_show` or `Satay_by_the_Bay`. |

The remaining unused files (`SEA_Aquarium`, `Jurong_Bird_Park`, `Night_Safari`, `Lasalle_College_of_the_Arts`, `Old_Supreme_Court`, `PARKROYAL_on_Pickering`, `Raffles_Landing_Site`, `The_Interlace`, `The_Substation`, `National_Design_Centre`, `Singapore_Coins_and_Notes_Museum`, `Singapore_Philatelic_Museum`, `Indian_National_Army_Monument`, `Fuk_Tak_Chi_Museum`, `Hajjah_Fatimah_Mosque`, `Contemporary_Arts_Center_NTU_CCA`, `Institute_of_Contemporary_Arts_Singapore`, `Bras_Basah_Bugis`, `Shophouses`, `Southern_Ridges`) do not correspond to a catalog place or an app area. They will stay dormant until a matching place (or an alias) exists.

## Quick checks after adding art

- `pnpm test:unit -- stampArt` should still pass.
- Start `pnpm dev`; new files are picked up automatically (the stamp folder triggers a reload).
- In the app: the map card stamp button, the post-stamp popup, the passport page and the Codex should all show the new art.
