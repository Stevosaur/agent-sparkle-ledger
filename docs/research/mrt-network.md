# Singapore MRT/LRT network: operating stations, 2024–2026 openings and future stations

Research date: **2026-10-10**. Scope:
1. Operating MRT and LRT lines and stations, with official names, codes and coordinates.
2. Stages that opened in 2024–2026.
3. Future stations and lines, with expected opening years.
4. Data sources for station coordinates.

---

## 0. How these facts were sourced (read this first)

- **Primary hosts could not be read directly.**
  - The WebFetch tool failed with `getaddrinfo ENOTFOUND` on every host tried: `www.lta.gov.sg`, `lta.gov.sg`, `data.gov.sg`, `en.wikipedia.org` and `blog.sgtrains.com`.
  - This container's `curl` gets a proxy 403 on `lta.gov.sg`, `datamall.lta.gov.sg`, `api-open.data.gov.sg`, `www.onemap.gov.sg`, `wikipedia.org` and `openstreetmap.org`.
  - `raw.githubusercontent.com` **is** reachable.
- **The web-search budget ran out mid-research.** The limit is 200 searches per turn, shared by all agents. Only 6 searches in this topic returned results. **JRL, CRL, Brickland and the Downtown Line (DTL) Sungei Kadut extension were never searched**, so those sections rest on the evidence noted against each row.
- **Evidence actually used:**
  1. **Web-search summaries** that cite LTA newsroom pages and secondary sites (Land Transport Guru, sgtrains, Wikipedia, AsiaOne). The URLs are listed. The page bodies were *not* fetched.
  2. **Primary government datasets, read through GitHub mirrors** that hold the files byte-for-byte as downloaded:
     - **URA "Master Plan 2019 Rail Station layer"** (data.gov.sg `d_8d886e3a83934d7447acdf5bc6959999`), mirrored at `https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/raw/master-plan-2019-rail-station-layer-geojson.geojson` (257 features: 253 `Polygon` + 4 `MultiPolygon`; every feature has `FMEL_UPD_D` = `20191209180316`).
     - **LTA DataMall train-station point table** (`STN_NAME` and `STN_NO`), mirrored at `https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/raw/MRTLRTStnPtt.json`. This is an older LTA export (191 rows, 171 distinct names; interchanges repeat once per line). For example, it still has `CE1`/`CE2` and lacks the TEL3–TEL4 stations; only two interchange rows already carry TEL3 codes (Orchard `NS22/TE14`, Marina Bay `NS27/TE20/CE2`), while Stevens is still `DT10` and Outram Park `EW16/NE3`. It also lists stations that were then unopened shells (`CC18` Bukit Brown, `DT4` Hume, `PW2` Teck Lee), so **presence in `STN_NO` is not evidence that a station is open**.
     - **LTA MRT Station Exit (GEOJSON)** (data.gov.sg `d_b39d3a0871985372d7e1637193335da5`). A third party retrieved it on **2026-10-01**; its latest feature update is `20260717145318`. It has 613 exits, grouped into 188 station names. Mirror: `https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/assets/mrt_stations.json`, documented in that repo's `docs/data-sources.md`.
  3. **cheeaun/sgraildata v5.1.0** (12 Jul 2026), which is the RailRouter SG dataset. It supplies station codes for 184 operating stations, with names taken from Wikipedia. Changelog: `https://raw.githubusercontent.com/cheeaun/sgraildata/master/CHANGELOG.md`.
  4. **My own knowledge**, used only where marked **UNVERIFIED**.
- Confidence labels:
  - **[VERIFIED-SEARCH]**: several search results, including an LTA newsroom URL, agree.
  - **[PRIMARY-DATA]**: read from the LTA or URA dataset content itself.
  - **[CORROBORATED]**: two or more independent non-primary sources agree.
  - **UNVERIFIED**: my best understanding, not confirmed in this session. **Re-check these before showing them as fact in the UI.**

---

## 1. Operating lines (as of 2026-10-10)

| App code | Line | Code prefix(es) | Termini | Operating stations | Unopened shells on the line |
|---|---|---|---|---|---|
| `NSL` | North-South Line | `NS` | NS1 Jurong East – NS28 Marina South Pier | 27 | none. NS6 is unused, reserved for future Sungei Kadut (see §4.7) |
| `EWL` | East-West Line | `EW`, `CG` (Changi Airport branch) | EW1 Pasir Ris – EW33 Tuas Link; branch EW4 Tanah Merah – CG1 Expo – CG2 Changi Airport | 35 (33 EW + 2 CG) | none |
| `NEL` | North East Line | `NE` | NE1 HarbourFront – NE18 Punggol Coast | 17 | none. NE2 is unused |
| `CCL` | Circle Line | `CC` (CE retired 12 Jul 2026) | CC1 Dhoby Ghaut … CC29 HarbourFront – CC30 … CC34 Bayfront. The loop closed on 12 Jul 2026. | 33 | **CC18 Bukit Brown** |
| `DTL` | Downtown Line | `DT` | DT1 Bukit Panjang – DT35 Expo | 35 | none |
| `TEL` | Thomson-East Coast Line | `TE` | TE1 Woodlands North – TE29 Bayshore | 27 | **TE10 Mount Pleasant**, **TE21 Marina South** |
| `BPLRT` | Bukit Panjang LRT | `BP` | Loop from BP1 Choa Chu Kang / BP6 Bukit Panjang | 13 | none. BP14 Ten Mile Junction closed in 2019 (UNVERIFIED date: 13 Jan 2019) |
| `SKLRT` | Sengkang LRT | `STC`, `SE` (East loop), `SW` (West loop) | Loops from STC Sengkang | 14 | none |
| `PGLRT` | Punggol LRT | `PTC`, `PE` (East loop), `PW` (West loop) | Loops from PTC Punggol | 15 | none. PW2 Teck Lee has been open since 2024 |

**Station counts** [PRIMARY-DATA + CORROBORATED; computed from §3]:
- **184 unique operating station names.** Of these, 146 are served by MRT and 42 by LRT. The 4 shared names are Choa Chu Kang, Bukit Panjang, Sengkang and Punggol.
- 29 stations serve two or more lines.

**Operators and colours** (UNVERIFIED in this session, high confidence; display only):
- **SMRT:** NSL (red), EWL (green), CCL (orange), TEL (brown), BPLRT (grey).
- **SBS Transit:** NEL (purple), DTL (blue), SKLRT and PGLRT (grey).
- Hex values in common use (UNVERIFIED against LTA brand guidelines): NSL `#D42E12`, EWL `#009645`, NEL `#9900AA`, CCL `#FA9E0D`, DTL `#005EC4`, TEL `#9D5B25`, LRT `#748477`.

**Station-code formatting rules**:
- LTA's own data joins interchange codes with `/` and no spaces, for example `NS24/NE6/CC1` and `EW13/NS25` [PRIMARY-DATA, `STN_NO`]. The order varies, so split on `/`.
- Tanah Merah is **`EW4` only** in LTA `STN_NO`. Some third-party data writes `EW4/CG` because the CG branch starts there. Do not invent a "CG" code.
- The Sengkang and Punggol LRT hub codes are `STC` and `PTC`, with no digits.

---

## 2. Stages and stations opened 2024–2026

| Date opened | What opened | Codes | Evidence |
|---|---|---|---|
| **23 Jun 2024** | TEL Stage 4 (TEL4): Tanjong Rhu, Katong Park, Tanjong Katong, Marine Parade, Marine Terrace, Siglap, Bayshore (7 stations) | TE23–TE29 | The LTA release "TEL4 to welcome commuters" (Mar 2024) exists: https://www.lta.gov.sg/content/ltagov/en/newsroom/2024/3/news-releases/TEL4_to_welcome_commuters.html (search-listed only). All 7 stations are in the 2026 LTA exit dataset [PRIMARY-DATA]. **The exact date of 23 Jun 2024 is UNVERIFIED** (high confidence). |
| **15 Aug 2024** | Teck Lee LRT station (Punggol LRT West loop) | PW2 | In the 2026 exit dataset [PRIMARY-DATA] and in the Wikipedia-derived operating-station list `sgraildata/data/raw/wikipedia-lrt.json` (Jul 2026). Note: the older `STN_NO` export also lists PW2, but it predates TEL3 and so listed Teck Lee while it was still a shell; that is not opening evidence. **Date UNVERIFIED.** |
| **10 Dec 2024** | Punggol Coast (NEL extension) | NE18 | The exit dataset has it under the code-only name `NE18`, with exit codes `1` and `2` [PRIMARY-DATA]. sgraildata 4.0.0 added it. **Date UNVERIFIED** (high confidence). |
| **28 Feb 2025** | Hume (DTL infill station) | DT4 | The exit dataset has it under the code-only name `DT4` [PRIMARY-DATA]. sgraildata 4.0.0 added it. **Date UNVERIFIED** (high confidence). |
| **12 Jul 2026** | **Circle Line Stage 6 (CCL6)**: Keppel, Cantonment, Prince Edward Road. Closes the loop, linking HarbourFront to Marina Bay. | CC30, CC31, CC32 | **[VERIFIED-SEARCH]** The LTA release of 14 May 2026 set a public preview on **4 Jul 2026** (free travel between the 3 stations) and passenger service from **12 Jul 2026**. The Kim Chuan Depot extension was also in operation from 12 Jul 2026. Several sources agree. |
| **12 Jul 2026** | **CCL code change**: Marina Bay `CE2` → **`CC33`** (now `NS27/CC33/TE20`). Bayfront `CE1` → **`CC34`** (now `CC34/DT16`). | CC33, CC34 | **[CORROBORATED]** by a search summary of a secondary source, by sgraildata CHANGELOG 5.1.0 (12 Jul 2026): "Rename CE1/CE2 station codes to CC34/CC33", and by the Wikipedia-derived `sgraildata/data/raw/wikipedia-mrt.json` (Marina Bay `["NS27","CC33","TE20"]`, Bayfront `["CC34","DT16"]`). Not read on an LTA page. |

After CCL6 the CCL has **33 stations** (CC1–CC34 minus the unopened CC18) and **12 interchanges**: Dhoby Ghaut, Promenade, Paya Lebar, MacPherson, Serangoon, Bishan, Caldecott, Botanic Gardens, Buona Vista, HarbourFront, Marina Bay and Bayfront. One search summary of LTA material gives "33 stations … 12 interchange stations". The post-CCL6 service pattern is not given here: the only source is Land Transport Guru, which describes peak-hour full-loop services plus a Dhoby Ghaut–Prince Edward Road service via Bishan, and I did not verify it. The property app should not need it.

**Not yet open as of 2026-10-10.** TEL Stage 5 and the DTL Stage 3 extension (DTL3e) are covered in §4.1. A property-guide page dated 8 Oct 2026 says they are not yet open, and no LTA opening date had been announced.

Earlier TEL stages, for context only (all **UNVERIFIED**, high confidence):
- TEL1 (TE1–TE3): 31 Jan 2020.
- TEL2 (TE4–TE9): 28 Aug 2021.
- TEL3 (TE11–TE20 and TE22, 11 stations from Stevens to Gardens by the Bay): 13 Nov 2022.

---

## 3. Operating stations: ordered code sequences per line

Generated from sgraildata v5.1.0 station codes, cross-checked against LTA `STN_NO` and against the LTA exit dataset names. Every one of the 184 names matched an LTA exit group. Interchange codes on other lines are shown in brackets.

**NSL: North-South Line** (27 stations)

NS1 Jurong East [EW24] · NS2 Bukit Batok · NS3 Bukit Gombak · NS4 Choa Chu Kang [BP1] · NS5 Yew Tee · NS7 Kranji · NS8 Marsiling · NS9 Woodlands [TE2] · NS10 Admiralty · NS11 Sembawang · NS12 Canberra · NS13 Yishun · NS14 Khatib · NS15 Yio Chu Kang · NS16 Ang Mo Kio · NS17 Bishan [CC15] · NS18 Braddell · NS19 Toa Payoh · NS20 Novena · NS21 Newton [DT11] · NS22 Orchard [TE14] · NS23 Somerset · NS24 Dhoby Ghaut [NE6/CC1] · NS25 City Hall [EW13] · NS26 Raffles Place [EW14] · NS27 Marina Bay [CC33/TE20] · NS28 Marina South Pier

**EWL: East-West Line (incl. Changi Airport branch CG)** (35 stations)

EW1 Pasir Ris · EW2 Tampines [DT32] · EW3 Simei · EW4 Tanah Merah · EW5 Bedok · EW6 Kembangan · EW7 Eunos · EW8 Paya Lebar [CC9] · EW9 Aljunied · EW10 Kallang · EW11 Lavender · EW12 Bugis [DT14] · EW13 City Hall [NS25] · EW14 Raffles Place [NS26] · EW15 Tanjong Pagar · EW16 Outram Park [NE3/TE17] · EW17 Tiong Bahru · EW18 Redhill · EW19 Queenstown · EW20 Commonwealth · EW21 Buona Vista [CC22] · EW22 Dover · EW23 Clementi · EW24 Jurong East [NS1] · EW25 Chinese Garden · EW26 Lakeside · EW27 Boon Lay · EW28 Pioneer · EW29 Joo Koon · EW30 Gul Circle · EW31 Tuas Crescent · EW32 Tuas West Road · EW33 Tuas Link · CG1 Expo [DT35] · CG2 Changi Airport

**NEL: North East Line** (17 stations)

NE1 HarbourFront [CC29] · NE3 Outram Park [EW16/TE17] · NE4 Chinatown [DT19] · NE5 Clarke Quay · NE6 Dhoby Ghaut [NS24/CC1] · NE7 Little India [DT12] · NE8 Farrer Park · NE9 Boon Keng · NE10 Potong Pasir · NE11 Woodleigh · NE12 Serangoon [CC13] · NE13 Kovan · NE14 Hougang · NE15 Buangkok · NE16 Sengkang [STC] · NE17 Punggol [PTC] · NE18 Punggol Coast

**CCL: Circle Line** (33 stations)

CC1 Dhoby Ghaut [NS24/NE6] · CC2 Bras Basah · CC3 Esplanade · CC4 Promenade [DT15] · CC5 Nicoll Highway · CC6 Stadium · CC7 Mountbatten · CC8 Dakota · CC9 Paya Lebar [EW8] · CC10 MacPherson [DT26] · CC11 Tai Seng · CC12 Bartley · CC13 Serangoon [NE12] · CC14 Lorong Chuan · CC15 Bishan [NS17] · CC16 Marymount · CC17 Caldecott [TE9] · CC19 Botanic Gardens [DT9] · CC20 Farrer Road · CC21 Holland Village · CC22 Buona Vista [EW21] · CC23 one-north · CC24 Kent Ridge · CC25 Haw Par Villa · CC26 Pasir Panjang · CC27 Labrador Park · CC28 Telok Blangah · CC29 HarbourFront [NE1] · CC30 Keppel · CC31 Cantonment · CC32 Prince Edward Road · CC33 Marina Bay [NS27/TE20] · CC34 Bayfront [DT16]

**DTL: Downtown Line** (35 stations)

DT1 Bukit Panjang [BP6] · DT2 Cashew · DT3 Hillview · DT4 Hume · DT5 Beauty World · DT6 King Albert Park · DT7 Sixth Avenue · DT8 Tan Kah Kee · DT9 Botanic Gardens [CC19] · DT10 Stevens [TE11] · DT11 Newton [NS21] · DT12 Little India [NE7] · DT13 Rochor · DT14 Bugis [EW12] · DT15 Promenade [CC4] · DT16 Bayfront [CC34] · DT17 Downtown · DT18 Telok Ayer · DT19 Chinatown [NE4] · DT20 Fort Canning · DT21 Bencoolen · DT22 Jalan Besar · DT23 Bendemeer · DT24 Geylang Bahru · DT25 Mattar · DT26 MacPherson [CC10] · DT27 Ubi · DT28 Kaki Bukit · DT29 Bedok North · DT30 Bedok Reservoir · DT31 Tampines West · DT32 Tampines [EW2] · DT33 Tampines East · DT34 Upper Changi · DT35 Expo [CG1]

**TEL: Thomson-East Coast Line** (27 stations)

TE1 Woodlands North · TE2 Woodlands [NS9] · TE3 Woodlands South · TE4 Springleaf · TE5 Lentor · TE6 Mayflower · TE7 Bright Hill · TE8 Upper Thomson · TE9 Caldecott [CC17] · TE11 Stevens [DT10] · TE12 Napier · TE13 Orchard Boulevard · TE14 Orchard [NS22] · TE15 Great World · TE16 Havelock · TE17 Outram Park [EW16/NE3] · TE18 Maxwell · TE19 Shenton Way · TE20 Marina Bay [NS27/CC33] · TE22 Gardens by the Bay · TE23 Tanjong Rhu · TE24 Katong Park · TE25 Tanjong Katong · TE26 Marine Parade · TE27 Marine Terrace · TE28 Siglap · TE29 Bayshore

**BPLRT: Bukit Panjang LRT** (13 stations)

BP1 Choa Chu Kang [NS4] · BP2 South View · BP3 Keat Hong · BP4 Teck Whye · BP5 Phoenix · BP6 Bukit Panjang [DT1] · BP7 Petir · BP8 Pending · BP9 Bangkit · BP10 Fajar · BP11 Segar · BP12 Jelapang · BP13 Senja

**SKLRT: Sengkang LRT (East loop SE, West loop SW)** (14 stations)

STC Sengkang [NE16] · SE1 Compassvale · SE2 Rumbia · SE3 Bakau · SE4 Kangkar · SE5 Ranggung · SW1 Cheng Lim · SW2 Farmway · SW3 Kupang · SW4 Thanggam · SW5 Fernvale · SW6 Layar · SW7 Tongkang · SW8 Renjong

**PGLRT: Punggol LRT (East loop PE, West loop PW)** (15 stations)

PTC Punggol [NE17] · PE1 Cove · PE2 Meridian · PE3 Coral Edge · PE4 Riviera · PE5 Kadaloor · PE6 Oasis · PE7 Damai · PW1 Sam Kee · PW2 Teck Lee · PW3 Punggol Point · PW4 Samudera · PW5 Nibong · PW6 Sumang · PW7 Soo Teck

### 3.1 Consolidated operating-station table (184 rows; use for a hand-curated name → codes → lines map)

- **Lat/Lng** = the arithmetic mean of that station's exit points in **LTA MRT Station Exit (GEOJSON)** (`d_b39d3a0871985372d7e1637193335da5`), snapshot of 2026-10-01 [PRIMARY-DATA via mirror].
- Where LTA lists the same name as both an MRT and an LRT station (Bukit Panjang, Choa Chu Kang, Punggol), the exits are merged.
- QA: every centroid is within **244 m** of sgraildata's independent station point. Marine Parade is 244 m off and Tampines 179 m off; all the others are 150 m or less. (Re-run 2026-10-10: all 184 lat/lng values and exit counts reproduce exactly from the mirror. Join on trimmed names: sgraildata spells Kaki Bukit as `"Kaki Bukit "` with a trailing space; after trimming it is 75 m off.)
- Official names follow LTA styling, for example `one-north` (lower case), `HarbourFront`, `MacPherson` and `Prince Edward Road`. The LTA datasets use UPPER CASE with the suffix `MRT STATION` or `LRT STATION`.

| # | Station (official name) | Codes | Lines | Lat | Lng | LTA exits |
|---|---|---|---|---|---|---|
| 1 | Admiralty | NS10 | NSL | 1.440407 | 103.800858 | 4 |
| 2 | Aljunied | EW9 | EWL | 1.316363 | 103.882485 | 2 |
| 3 | Ang Mo Kio | NS16 | NSL | 1.369618 | 103.849676 | 4 |
| 4 | Bakau | SE3 | SKLRT | 1.388013 | 103.905464 | 2 |
| 5 | Bangkit | BP9 | BPLRT | 1.379853 | 103.772591 | 1 |
| 6 | Bartley | CC12 | CCL | 1.342875 | 103.879582 | 2 |
| 7 | Bayfront | CC34 / DT16 | CCL, DTL | 1.282089 | 103.859205 | 5 |
| 8 | Bayshore | TE29 | TEL | 1.312815 | 103.941583 | 5 |
| 9 | Beauty World | DT5 | DTL | 1.341087 | 103.775732 | 3 |
| 10 | Bedok | EW5 | EWL | 1.323971 | 103.929411 | 3 |
| 11 | Bedok North | DT29 | DTL | 1.334522 | 103.918515 | 4 |
| 12 | Bedok Reservoir | DT30 | DTL | 1.336451 | 103.933187 | 2 |
| 13 | Bencoolen | DT21 | DTL | 1.298364 | 103.849892 | 3 |
| 14 | Bendemeer | DT23 | DTL | 1.313667 | 103.863146 | 2 |
| 15 | Bishan | NS17 / CC15 | NSL, CCL | 1.350863 | 103.848692 | 5 |
| 16 | Boon Keng | NE9 | NEL | 1.319086 | 103.861371 | 3 |
| 17 | Boon Lay | EW27 | EWL | 1.338476 | 103.705718 | 6 |
| 18 | Botanic Gardens | CC19 / DT9 | CCL, DTL | 1.322610 | 103.815446 | 2 |
| 19 | Braddell | NS18 | NSL | 1.340828 | 103.846759 | 3 |
| 20 | Bras Basah | CC2 | CCL | 1.297001 | 103.850526 | 5 |
| 21 | Bright Hill | TE7 | TEL | 1.363167 | 103.832869 | 4 |
| 22 | Buangkok | NE15 | NEL | 1.383030 | 103.893173 | 2 |
| 23 | Bugis | EW12 / DT14 | EWL, DTL | 1.299914 | 103.856562 | 8 |
| 24 | Bukit Batok | NS2 | NSL | 1.349219 | 103.749699 | 4 |
| 25 | Bukit Gombak | NS3 | NSL | 1.359032 | 103.751962 | 4 |
| 26 | Bukit Panjang | DT1 / BP6 | DTL, BPLRT | 1.378622 | 103.762143 | 8 |
| 27 | Buona Vista | EW21 / CC22 | EWL, CCL | 1.306929 | 103.790659 | 4 |
| 28 | Caldecott | CC17 / TE9 | CCL, TEL | 1.337487 | 103.840035 | 4 |
| 29 | Canberra | NS12 | NSL | 1.443227 | 103.829712 | 5 |
| 30 | Cantonment | CC31 | CCL | 1.273048 | 103.836977 | 4 |
| 31 | Cashew | DT2 | DTL | 1.369833 | 103.764234 | 1 |
| 32 | Changi Airport | CG2 | EWL | 1.356781 | 103.988291 | 2 |
| 33 | Cheng Lim | SW1 | SKLRT | 1.396280 | 103.893802 | 2 |
| 34 | Chinatown | NE4 / DT19 | NEL, DTL | 1.284641 | 103.844073 | 6 |
| 35 | Chinese Garden | EW25 | EWL | 1.341996 | 103.732785 | 3 |
| 36 | Choa Chu Kang | NS4 / BP1 | NSL, BPLRT | 1.385328 | 103.744458 | 9 |
| 37 | City Hall | NS25 / EW13 | NSL, EWL | 1.293206 | 103.852441 | 4 |
| 38 | Clarke Quay | NE5 | NEL | 1.288616 | 103.846565 | 6 |
| 39 | Clementi | EW23 | EWL | 1.314771 | 103.765372 | 4 |
| 40 | Commonwealth | EW20 | EWL | 1.302373 | 103.798379 | 4 |
| 41 | Compassvale | SE1 | SKLRT | 1.394431 | 103.900661 | 2 |
| 42 | Coral Edge | PE3 | PGLRT | 1.393828 | 103.912680 | 2 |
| 43 | Cove | PE1 | PGLRT | 1.399214 | 103.906053 | 2 |
| 44 | Dakota | CC8 | CCL | 1.308455 | 103.888643 | 2 |
| 45 | Damai | PE7 | PGLRT | 1.405165 | 103.908703 | 2 |
| 46 | Dhoby Ghaut | NS24 / NE6 / CC1 | NSL, NEL, CCL | 1.299411 | 103.845502 | 6 |
| 47 | Dover | EW22 | EWL | 1.311554 | 103.778385 | 2 |
| 48 | Downtown | DT17 | DTL | 1.279553 | 103.852771 | 6 |
| 49 | Esplanade | CC3 | CCL | 1.293194 | 103.855681 | 7 |
| 50 | Eunos | EW7 | EWL | 1.319537 | 103.902897 | 3 |
| 51 | Expo | DT35 / CG1 | DTL, EWL | 1.335180 | 103.962394 | 8 |
| 52 | Fajar | BP10 | BPLRT | 1.384465 | 103.770676 | 1 |
| 53 | Farmway | SW2 | SKLRT | 1.397166 | 103.889261 | 2 |
| 54 | Farrer Park | NE8 | NEL | 1.312161 | 103.854337 | 9 |
| 55 | Farrer Road | CC20 | CCL | 1.317523 | 103.807677 | 2 |
| 56 | Fernvale | SW5 | SKLRT | 1.392158 | 103.876262 | 1 |
| 57 | Fort Canning | DT20 | DTL | 1.292618 | 103.844298 | 2 |
| 58 | Gardens by the Bay | TE22 | TEL | 1.279167 | 103.867903 | 3 |
| 59 | Geylang Bahru | DT24 | DTL | 1.321335 | 103.871675 | 2 |
| 60 | Great World | TE15 | TEL | 1.294296 | 103.833092 | 6 |
| 61 | Gul Circle | EW30 | EWL | 1.318935 | 103.659940 | 2 |
| 62 | HarbourFront | NE1 / CC29 | NEL, CCL | 1.265411 | 103.821500 | 6 |
| 63 | Havelock | TE16 | TEL | 1.288439 | 103.833734 | 5 |
| 64 | Haw Par Villa | CC25 | CCL | 1.283055 | 103.782006 | 1 |
| 65 | Hillview | DT3 | DTL | 1.362279 | 103.767398 | 2 |
| 66 | Holland Village | CC21 | CCL | 1.311000 | 103.795887 | 3 |
| 67 | Hougang | NE14 | NEL | 1.371432 | 103.892464 | 3 |
| 68 | Hume | DT4 | DTL | 1.354946 | 103.768674 | 2 |
| 69 | Jalan Besar | DT22 | DTL | 1.305179 | 103.855270 | 2 |
| 70 | Jelapang | BP12 | BPLRT | 1.386833 | 103.764677 | 1 |
| 71 | Joo Koon | EW29 | EWL | 1.327729 | 103.678583 | 2 |
| 72 | Jurong East | NS1 / EW24 | NSL, EWL | 1.333211 | 103.742365 | 4 |
| 73 | Kadaloor | PE5 | PGLRT | 1.399610 | 103.916452 | 2 |
| 74 | Kaki Bukit | DT28 | DTL | 1.335116 | 103.909276 | 2 |
| 75 | Kallang | EW10 | EWL | 1.311661 | 103.871659 | 2 |
| 76 | Kangkar | SE4 | SKLRT | 1.383920 | 103.902212 | 2 |
| 77 | Katong Park | TE24 | TEL | 1.297960 | 103.886080 | 2 |
| 78 | Keat Hong | BP3 | BPLRT | 1.378465 | 103.749227 | 1 |
| 79 | Kembangan | EW6 | EWL | 1.321038 | 103.912920 | 2 |
| 80 | Kent Ridge | CC24 | CCL | 1.293487 | 103.784575 | 4 |
| 81 | Keppel | CC30 | CCL | 1.270386 | 103.830110 | 3 |
| 82 | Khatib | NS14 | NSL | 1.417404 | 103.832937 | 4 |
| 83 | King Albert Park | DT6 | DTL | 1.335757 | 103.783796 | 2 |
| 84 | Kovan | NE13 | NEL | 1.359981 | 103.884827 | 3 |
| 85 | Kranji | NS7 | NSL | 1.424961 | 103.762053 | 4 |
| 86 | Kupang | SW3 | SKLRT | 1.398222 | 103.881139 | 2 |
| 87 | Labrador Park | CC27 | CCL | 1.272107 | 103.802356 | 1 |
| 88 | Lakeside | EW26 | EWL | 1.344123 | 103.721079 | 3 |
| 89 | Lavender | EW11 | EWL | 1.307394 | 103.862847 | 2 |
| 90 | Layar | SW6 | SKLRT | 1.392085 | 103.880152 | 2 |
| 91 | Lentor | TE5 | TEL | 1.384739 | 103.836552 | 5 |
| 92 | Little India | NE7 / DT12 | NEL, DTL | 1.306748 | 103.849279 | 6 |
| 93 | Lorong Chuan | CC14 | CCL | 1.351589 | 103.863926 | 2 |
| 94 | MacPherson | CC10 / DT26 | CCL, DTL | 1.325871 | 103.889558 | 5 |
| 95 | Marina Bay | NS27 / CC33 / TE20 | NSL, CCL, TEL | 1.275451 | 103.855131 | 5 |
| 96 | Marina South Pier | NS28 | NSL | 1.270984 | 103.862955 | 2 |
| 97 | Marine Parade | TE26 | TEL | 1.303777 | 103.906844 | 6 |
| 98 | Marine Terrace | TE27 | TEL | 1.306694 | 103.915074 | 6 |
| 99 | Marsiling | NS8 | NSL | 1.432694 | 103.774109 | 4 |
| 100 | Marymount | CC16 | CCL | 1.348423 | 103.839574 | 2 |
| 101 | Mattar | DT25 | DTL | 1.326858 | 103.883240 | 2 |
| 102 | Maxwell | TE18 | TEL | 1.280715 | 103.843992 | 3 |
| 103 | Mayflower | TE6 | TEL | 1.372040 | 103.836766 | 7 |
| 104 | Meridian | PE2 | PGLRT | 1.396902 | 103.908918 | 2 |
| 105 | Mountbatten | CC7 | CCL | 1.306399 | 103.882923 | 2 |
| 106 | Napier | TE12 | TEL | 1.306641 | 103.819496 | 2 |
| 107 | Newton | NS21 / DT11 | NSL, DTL | 1.312763 | 103.838114 | 3 |
| 108 | Nibong | PW5 | PGLRT | 1.411841 | 103.900303 | 2 |
| 109 | Nicoll Highway | CC5 | CCL | 1.299916 | 103.863829 | 2 |
| 110 | Novena | NS20 | NSL | 1.320495 | 103.843864 | 2 |
| 111 | Oasis | PE6 | PGLRT | 1.402305 | 103.912700 | 2 |
| 112 | one-north | CC23 | CCL | 1.299794 | 103.787546 | 4 |
| 113 | Orchard | NS22 / TE14 | NSL, TEL | 1.303789 | 103.831860 | 13 |
| 114 | Orchard Boulevard | TE13 | TEL | 1.303043 | 103.823767 | 2 |
| 115 | Outram Park | EW16 / NE3 / TE17 | EWL, NEL, TEL | 1.280728 | 103.839077 | 8 |
| 116 | Pasir Panjang | CC26 | CCL | 1.276003 | 103.792030 | 1 |
| 117 | Pasir Ris | EW1 | EWL | 1.372864 | 103.949235 | 2 |
| 118 | Paya Lebar | EW8 / CC9 | EWL, CCL | 1.317721 | 103.892441 | 6 |
| 119 | Pending | BP8 | BPLRT | 1.376297 | 103.771328 | 1 |
| 120 | Petir | BP7 | BPLRT | 1.377603 | 103.766793 | 1 |
| 121 | Phoenix | BP5 | BPLRT | 1.378614 | 103.758252 | 1 |
| 122 | Pioneer | EW28 | EWL | 1.337588 | 103.697142 | 2 |
| 123 | Potong Pasir | NE10 | NEL | 1.331672 | 103.869001 | 3 |
| 124 | Prince Edward Road | CC32 | CCL | 1.273235 | 103.846218 | 2 |
| 125 | Promenade | CC4 / DT15 | CCL, DTL | 1.293226 | 103.860349 | 3 |
| 126 | Punggol | NE17 / PTC | NEL, PGLRT | 1.404816 | 103.902205 | 4 |
| 127 | Punggol Coast | NE18 | NEL | 1.414963 | 103.910107 | 2 |
| 128 | Punggol Point | PW3 | PGLRT | 1.416789 | 103.906756 | 2 |
| 129 | Queenstown | EW19 | EWL | 1.294852 | 103.805893 | 4 |
| 130 | Raffles Place | NS26 / EW14 | NSL, EWL | 1.283704 | 103.851415 | 10 |
| 131 | Ranggung | SE5 | SKLRT | 1.384140 | 103.897273 | 2 |
| 132 | Redhill | EW18 | EWL | 1.289429 | 103.817121 | 2 |
| 133 | Renjong | SW8 | SKLRT | 1.386756 | 103.890423 | 2 |
| 134 | Riviera | PE4 | PGLRT | 1.394443 | 103.916099 | 2 |
| 135 | Rochor | DT13 | DTL | 1.303809 | 103.852739 | 2 |
| 136 | Rumbia | SE2 | SKLRT | 1.391377 | 103.906062 | 2 |
| 137 | Sam Kee | PW1 | PGLRT | 1.409766 | 103.904916 | 2 |
| 138 | Samudera | PW4 | PGLRT | 1.415885 | 103.902137 | 2 |
| 139 | Segar | BP11 | BPLRT | 1.387812 | 103.769410 | 1 |
| 140 | Sembawang | NS11 | NSL | 1.448922 | 103.820015 | 4 |
| 141 | Sengkang | NE16 / STC | NEL, SKLRT | 1.391719 | 103.895489 | 4 |
| 142 | Senja | BP13 | BPLRT | 1.382875 | 103.762326 | 1 |
| 143 | Serangoon | NE12 / CC13 | NEL, CCL | 1.350262 | 103.873297 | 8 |
| 144 | Shenton Way | TE19 | TEL | 1.277471 | 103.850936 | 6 |
| 145 | Siglap | TE28 | TEL | 1.309855 | 103.929979 | 4 |
| 146 | Simei | EW3 | EWL | 1.342662 | 103.953819 | 1 |
| 147 | Sixth Avenue | DT7 | DTL | 1.331151 | 103.796707 | 2 |
| 148 | Somerset | NS23 | NSL | 1.300368 | 103.838840 | 4 |
| 149 | Soo Teck | PW7 | PGLRT | 1.405130 | 103.897220 | 2 |
| 150 | South View | BP2 | BPLRT | 1.380318 | 103.745101 | 1 |
| 151 | Springleaf | TE4 | TEL | 1.398097 | 103.818159 | 3 |
| 152 | Stadium | CC6 | CCL | 1.302941 | 103.875313 | 2 |
| 153 | Stevens | DT10 / TE11 | DTL, TEL | 1.320142 | 103.825788 | 5 |
| 154 | Sumang | PW6 | PGLRT | 1.408428 | 103.898547 | 2 |
| 155 | Tai Seng | CC11 | CCL | 1.335436 | 103.888034 | 3 |
| 156 | Tampines | EW2 / DT32 | EWL, DTL | 1.354316 | 103.943782 | 7 |
| 157 | Tampines East | DT33 | DTL | 1.356143 | 103.955283 | 4 |
| 158 | Tampines West | DT31 | DTL | 1.345315 | 103.938573 | 2 |
| 159 | Tan Kah Kee | DT8 | DTL | 1.325740 | 103.807800 | 2 |
| 160 | Tanah Merah | EW4 | EWL | 1.326960 | 103.945759 | 2 |
| 161 | Tanjong Katong | TE25 | TEL | 1.299428 | 103.897484 | 3 |
| 162 | Tanjong Pagar | EW15 | EWL | 1.276506 | 103.846433 | 9 |
| 163 | Tanjong Rhu | TE23 | TEL | 1.297330 | 103.873541 | 2 |
| 164 | Teck Lee | PW2 | PGLRT | 1.412902 | 103.906646 | 2 |
| 165 | Teck Whye | BP4 | BPLRT | 1.376564 | 103.753826 | 1 |
| 166 | Telok Ayer | DT18 | DTL | 1.282387 | 103.848344 | 5 |
| 167 | Telok Blangah | CC28 | CCL | 1.270721 | 103.809884 | 1 |
| 168 | Thanggam | SW4 | SKLRT | 1.397195 | 103.875627 | 2 |
| 169 | Tiong Bahru | EW17 | EWL | 1.286061 | 103.827244 | 2 |
| 170 | Toa Payoh | NS19 | NSL | 1.332741 | 103.847285 | 4 |
| 171 | Tongkang | SW7 | SKLRT | 1.389280 | 103.886023 | 2 |
| 172 | Tuas Crescent | EW31 | EWL | 1.321004 | 103.649123 | 2 |
| 173 | Tuas Link | EW33 | EWL | 1.340683 | 103.637044 | 2 |
| 174 | Tuas West Road | EW32 | EWL | 1.330027 | 103.639538 | 2 |
| 175 | Ubi | DT27 | DTL | 1.329891 | 103.899231 | 2 |
| 176 | Upper Changi | DT34 | DTL | 1.341548 | 103.961285 | 5 |
| 177 | Upper Thomson | TE8 | TEL | 1.354527 | 103.832821 | 5 |
| 178 | Woodlands | NS9 / TE2 | NSL, TEL | 1.436187 | 103.787627 | 7 |
| 179 | Woodlands North | TE1 | TEL | 1.448492 | 103.785265 | 2 |
| 180 | Woodlands South | TE3 | TEL | 1.426972 | 103.793958 | 5 |
| 181 | Woodleigh | NE11 | NEL | 1.338987 | 103.870834 | 3 |
| 182 | Yew Tee | NS5 | NSL | 1.397499 | 103.747267 | 4 |
| 183 | Yio Chu Kang | NS15 | NSL | 1.381715 | 103.844809 | 3 |
| 184 | Yishun | NS13 | NSL | 1.429385 | 103.835050 | 5 |

---

## 4. Future and unopened stations (as of 2026-10-10)

**Coordinates.**
- Unless noted, coordinates are the **area-weighted polygon centroid** from the URA Master Plan 2019 Rail Station layer [PRIMARY-DATA, `FMEL_UPD_D` 2019-12-09]. They are indicative planning footprints, so treat them as approximate (`approximate: true`). Calibration (computed 2026-10-10): for the 154 operating stations whose MP2019 name matches an LTA exit group, the MP2019 centroid is a median **25 m** (90th percentile 68 m) from the LTA exit centroid; 6 of 154 exceed 100 m. For stations that opened after the 2019 plan the error ranged 4–180 m (Prince Edward Road 116 m, Marine Parade 180 m). The single 640 m outlier (Jalan Besar) is a labelling error, see §5.2 pitfall 6.
- Where a future station sits at an existing station, the coordinate is the existing LTA station coordinate from §3.1 unless a separate underground footprint exists in MP2019.
- `null` means no credible coordinate was found. **Do not invent one.** Exclude the station from distance calculations until the URA amendment layer (§5.3) or an LTA source gives one.

### 4.1 TEL Stage 5 (TEL5) and DTL Stage 3 extension (DTL3e): target **second half (2H) of 2026**, not yet open

- **Timeline** [VERIFIED-SEARCH, mostly secondary sources]:
  - The target slipped from 2024 to 2025, then to **2026** (MOT Committee of Supply (COS) debate, 5 Mar 2024), and was refined to **2H 2026** at COS 2025 (5 Mar 2025).
  - An LTA 2025 release (https://www.lta.gov.sg/content/ltagov/en/newsroom/2025/1/news-releases/three_new_stations_to_connect.html, search-listed) says DTL3e "comprising Xilin and Sungei Bedok stations … will open in second half of 2026". **Attribution UNVERIFIED:** the page body was never fetched, and §4.7 cites the same URL for a different announcement (three new north-west stations by 2035). Either the release mentions DTL3e as context or a search snippet was mis-attributed; do not cite this URL for the 2H 2026 target until it is read.
  - The LTA project page is https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/downtown_line_2_and_3_extensions.html (search-listed).
- **Why TEL5 and DTL3e open together.** Sources say they cannot open separately because of a shared integrated fire-protection system at Sungei Bedok.
- **April 2026 LTA statement** (via a search summary of a secondary source; UNVERIFIED on LTA): final systems-integration tests ahead of a 2H 2026 opening, with shortened weekend service on TEL from 22 May to 4 Jul 2026 and on DTL from 10 Jul to 5 Sep 2026.
- **Status on 2026-10-08** (secondary source: https://bedoksouthmrtcondo.com/insights/bedok-south-mrt-completion-date-timeline/): not open, and no LTA opening date or public preview announced.
  - ⇒ App: `status: "future"`, `expectedYear: 2026`.
  - **Re-check the LTA newsroom before every deploy** and flip the status once LTA announces an opening.

| Station | Line(s) | Code(s) | Expected | Lat | Lng | Coord source |
|---|---|---|---|---|---|---|
| Bedok South | TEL | TE30 [CORROBORATED, secondary sources] | 2H 2026 | 1.31665 | 103.94923 | URA MP2019 centroid |
| Sungei Bedok | TEL + DTL (interchange) | TE31 / DT37 [CORROBORATED, secondary sources] | 2H 2026 | 1.32040 | 103.95721 | URA MP2019 centroid |
| Xilin | DTL | DT36 [CORROBORATED, secondary sources] | 2H 2026 | 1.32873 | 103.96487 | URA MP2019 centroid |

### 4.2 Built or planned stations on existing lines with no committed opening year

| Station | Line | Code | Expected | Lat | Lng | Notes |
|---|---|---|---|---|---|---|
| Bukit Brown | CCL | CC18 [PRIMARY-DATA: LTA `STN_NO` "CC18" = "BUKIT BROWN MRT STATION"] | null (opens when the area is developed; UNVERIFIED) | 1.33373 | 103.83072 | Shell station between CC17 Caldecott and CC19 Botanic Gardens |
| Mount Pleasant | TEL | TE10 (code gap between TE9 and TE11; UNVERIFIED) | null (to open in step with the Mount Pleasant housing estate; year UNVERIFIED) | 1.32855 | 103.83506 | Shell station between Caldecott and Stevens |
| Marina South | TEL | TE21 (code gap between TE20 and TE22; UNVERIFIED) | null (to open with Marina South developments; UNVERIFIED) | 1.274020 | 103.862211 | **Coordinate = mean of 4 LTA exits.** The **LTA exit dataset already contains `MARINA SOUTH MRT STATION`** (Exit 1–4) although the station is not open: **exclude it from "nearest operational MRT"** |
| Founders' Memorial | TEL | TE22A (UNVERIFIED) | UNVERIFIED (my understanding: about 2028, timed with the Founders' Memorial at Bay East Garden). Use `null` until confirmed | 1.29097 | 103.86894 | Between TE22 Gardens by the Bay and TE23 Tanjong Rhu. Present in URA MP2019 as `FOUNDERS' MEMORIAL` (underground) |

### 4.3 Jurong Region Line (JRL): 24 stations, fully elevated, in 3 stages

- **Station names** are confirmed by the URA MP2019 layer [PRIMARY-DATA].
- **Codes and stage years are UNVERIFIED.** They are my understanding of LTA's JRL project page; JRL was never searched in this session.
- Stages: **Stage 1 in 2027** (10 stations, Choa Chu Kang – Boon Lay, plus Bahar Junction – Tawas), **Stage 2 in 2028** (7 stations, Tengah – Pandan Reservoir), **Stage 3 in 2029** (7 stations, Boon Lay – Jurong Pier and Tawas – Peng Kang Hill). *Corrected 2026-10-10:* Stage 3 previously read "Bahar Junction – Peng Kang Hill", which contradicts the table below (Gek Poh and Tawas are Stage 1); Stage 3 adds only Nanyang Gateway, Nanyang Crescent and Peng Kang Hill on that branch. 10 + 7 + 7 = 24 stations, matching the line total.
- I found no 2025–2026 change to these years, but none could be checked.
- **The station order is consistent with the MP2019 geometry**, read west to east and north to south.
- Expected LTA project page: https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/jurong_region_line.html (UNVERIFIED URL).

| Stage (year, UNVERIFIED) | Station | Code (UNVERIFIED) | Interchange | Lat | Lng | Coord source |
|---|---|---|---|---|---|---|
| 1 (2027) | Choa Chu Kang | JS1 | NS4 / BP1 | 1.385328 | 103.744458 | existing LTA station (approx.) |
| 1 (2027) | Choa Chu Kang West | JS2 | | 1.37922 | 103.74003 | MP2019 |
| 1 (2027) | Tengah | JS3 / JE0 | JRL branch junction | 1.36638 | 103.73009 | MP2019 |
| 1 (2027) | Hong Kah | JS4 | | 1.35809 | 103.72611 | MP2019 |
| 1 (2027) | Corporation | JS5 | | 1.35297 | 103.71381 | MP2019 |
| 1 (2027) | Jurong West | JS6 | | 1.34919 | 103.70826 | MP2019 |
| 1 (2027) | Bahar Junction | JS7 | JRL branch junction | 1.34619 | 103.70303 | MP2019 |
| 1 (2027) | Boon Lay | JS8 | EW27 | 1.338476 | 103.705718 | existing LTA station (approx.) |
| 1 (2027) | Gek Poh | JW1 | | 1.34835 | 103.69812 | MP2019 |
| 1 (2027) | Tawas | JW2 | | 1.35066 | 103.69189 | MP2019 |
| 2 (2028) | Tengah Plantation | JE1 | | 1.35733 | 103.73345 | MP2019 |
| 2 (2028) | Tengah Park | JE2 | | 1.35233 | 103.73679 | MP2019 |
| 2 (2028) | Bukit Batok West | JE3 | | 1.34567 | 103.73950 | MP2019 |
| 2 (2028) | Toh Guan | JE4 | | 1.33991 | 103.74250 | MP2019 |
| 2 (2028) | Jurong East | JE5 | NS1 / EW24 | 1.333211 | 103.742365 | existing LTA station (approx.) |
| 2 (2028) | Jurong Town Hall | JE6 | | 1.32638 | 103.74521 | MP2019 |
| 2 (2028) | Pandan Reservoir | JE7 | | 1.32046 | 103.74480 | MP2019. The `NAME` has a trailing space: `"PANDAN RESERVOIR "` |
| 3 (2029) | Enterprise | JS9 | | 1.33273 | 103.70858 | MP2019 |
| 3 (2029) | Tukang | JS10 | | 1.32541 | 103.70925 | MP2019 |
| 3 (2029) | Jurong Hill | JS11 | | 1.31862 | 103.71013 | MP2019 |
| 3 (2029) | Jurong Pier | JS12 | | 1.31313 | 103.71040 | MP2019 |
| 3 (2029) | Nanyang Gateway | JW3 | | 1.35369 | 103.68660 | MP2019 |
| 3 (2029) | Nanyang Crescent | JW4 | | 1.34841 | 103.68081 | MP2019 |
| 3 (2029) | Peng Kang Hill | JW5 | | 1.34321 | 103.67856 | MP2019 |

### 4.4 Cross Island Line (CRL) Phase 1: 12 stations, Aviation Park – Bright Hill

- **Station names** are confirmed by URA MP2019 [PRIMARY-DATA].
- **Expected year: 2030 (UNVERIFIED).** This is my understanding of LTA's position after the COVID-19 delays; it was not searched in this session.
- **Codes are UNVERIFIED.** My understanding is that `CR1` is reserved for a future Changi Airport Terminal 5 station, so Phase 1 runs CR2–CR13.
- **App guidance:** show CRL codes only after verification, and leave `codes: []` until then.

| Station | Code (UNVERIFIED) | Interchange | Lat | Lng | Coord source |
|---|---|---|---|---|---|
| Aviation Park | CR2 | | 1.37021 | 104.00351 | MP2019 |
| Loyang | CR3 | | 1.37114 | 103.97192 | MP2019 |
| Pasir Ris East | CR4 | | 1.36702 | 103.96058 | MP2019 |
| Pasir Ris | CR5 | EW1 (and the CRL Punggol extension) | 1.37126 | 103.94888 | MP2019, underground part of `PASIR RIS INTERCHANGE` |
| Tampines North | CR6 | | 1.36946 | 103.93813 | MP2019 |
| Defu | CR7 | | 1.36234 | 103.89900 | MP2019 |
| Hougang | CR8 | NE14 | 1.37091 | 103.89119 | MP2019, largest underground part of `HOUGANG INTERCHANGE` |
| Serangoon North | CR9 | | 1.37060 | 103.87379 | MP2019 |
| Tavistock | CR10 | | 1.37019 | 103.86325 | MP2019 |
| Ang Mo Kio | CR11 | NS16 | 1.36939 | 103.85091 | MP2019, underground part of `ANG MO KIO INTERCHANGE` |
| Teck Ghee | CR12 | | 1.36542 | 103.84352 | MP2019 |
| Bright Hill | CR13 | TE7 | 1.36331 | 103.83494 | MP2019, `BRIGHT HILL INTERCHANGE` |

### 4.5 CRL Punggol Extension (CPE): expected **2032** (UNVERIFIED)

My understanding (UNVERIFIED, not searched):
- About 4 km from Pasir Ris (CR5) to Punggol, with new stations **Elias** and **Riviera**. Riviera is an interchange with PE4 Riviera LRT.
- The terminus is at **Punggol** (NE17/PTC). The station codes are possibly `CP1`–`CP4`.
- None of these stations is in URA MP2019.

| Station | Code (UNVERIFIED) | Expected (UNVERIFIED) | Lat | Lng | Coord source |
|---|---|---|---|---|---|
| Elias | CP2 | 2032 | null | null | not found |
| Riviera | CP3 | 2032 | 1.394443 | 103.916099 | existing PE4 LRT station (approx.) |
| Punggol | CP4 | 2032 | 1.404816 | 103.902205 | existing NE17/PTC (approx.) |

### 4.6 CRL Phase 2: Turf City – Jurong Lake District, expected **2032** (UNVERIFIED)

My understanding (UNVERIFIED, not searched): this phase was announced in Sep 2022, with 6 stations and about 15 km of track. The stretch from Bright Hill to Turf City (Phase 3, under the Central Catchment Nature Reserve) has no confirmed date. None of these stations is in URA MP2019.

| Station | Interchange | Lat | Lng | Coord source |
|---|---|---|---|---|
| Turf City | | null | null | not found |
| King Albert Park | DT6 | 1.335757 | 103.783796 | existing LTA station (approx.) |
| Maju | | null | null | not found |
| Clementi | EW23 | 1.314771 | 103.765372 | existing LTA station (approx.) |
| West Coast | | null | null | not found |
| Jurong Lake District | | null | null | not found |

### 4.7 NSL Brickland, and the DTL extension to Sungei Kadut

- **[VERIFIED-SEARCH, headline level only]** In **January 2025**, LTA announced **three new MRT stations**, among them **a new interchange connecting the DTL and the NSL**, to open **by 2035**.
  - AsiaOne headline: "3 new MRT stations, including new interchange connecting Downtown Line and North-South Line, to open by 2035" (https://www.asiaone.com/singapore/3-new-mrt-stations-including-new-interchange-connecting-downtown-line-and-north-south-line-2035-lta).
  - LTA release slug: `newsroom/2025/1/news-releases/three_new_stations_to_connect.html`.
- **Details are UNVERIFIED** (not searched), so the following is my understanding:
  - The DTL will be extended north from DT1 Bukit Panjang to a new **Sungei Kadut** interchange with the NSL. On the NSL it sits between NS5 Yew Tee and NS7 Kranji and probably takes the unused code `NS6`.
  - There will be at least one intermediate DTL station. Search results show a Wikipedia page titled "DE1 MRT station", which suggests the placeholder names `DE1`, `DE2` and so on.
  - Target year: 2035.
- **Brickland** is a new NSL infill station between NS3 Bukit Gombak and NS4 Choa Chu Kang, serving the Brickland/Tengah area. **Expected 2034 (UNVERIFIED)**, code possibly `NS3A` (UNVERIFIED).
  - It is unclear whether Brickland is one of the "3 new stations" in the January 2025 release.
- None of these stations is in URA MP2019, so all coordinates are `null`.
  - Check the **URA MP2019 amendment layer** (§5.3), which may contain them.
  - A last-resort fallback is the midpoint of the neighbouring stations: Brickland ≈ midpoint of NS3 and NS4, and Sungei Kadut ≈ between NS5 and NS7. Error could be ±1 km, so **do not use it for distance badges**.

| Station | Line | Code | Expected | Lat | Lng |
|---|---|---|---|---|---|
| Brickland | NSL | NS3A (UNVERIFIED) | 2034 (UNVERIFIED) | null | null |
| Sungei Kadut | NSL + DTL | NS6 / DT? (UNVERIFIED) | by 2035 (headline-verified) | null | null |
| DTL extension intermediate station(s) (working name "DE1"?) | DTL | UNVERIFIED | by 2035 | null | null |

### 4.8 TEL extension to Changi Airport Terminal 5 (and CRL to T5)

**UNVERIFIED** (not searched). My understanding:
- The TEL will be extended from Sungei Bedok to Changi Airport Terminal 5.
- The existing EWL Changi Airport branch (EW4 Tanah Merah – CG1 Expo – CG2 Changi Airport) will be converted to TEL.
- CRL will also reach T5.
- Timing is tied to T5, which is expected around the mid-2030s.

Search results did list a Wikipedia page titled "Changi Terminal 5 MRT station". **Use `expectedYear: null`. Do not change the CG codes in the app until LTA publishes new codes.**

### 4.9 Machine-readable future-station seed (matches the `MrtStation` type in `src/lib/data/types.ts`)

- Only rows with an **LTA-published or strongly corroborated** year and a credible coordinate are seeded. Everything else stays out of distance calculations until verified.
- `codes` holds only codes that are corroborated; rows with UNVERIFIED codes have `codes: []`.

```json
[
  {"name":"Bedok South","codes":["TE30"],"lines":["TEL"],"status":"future","expectedYear":2026,"approximate":true,"lat":1.31665,"lng":103.94923},
  {"name":"Sungei Bedok","codes":["TE31","DT37"],"lines":["TEL","DTL"],"status":"future","expectedYear":2026,"approximate":true,"lat":1.32040,"lng":103.95721},
  {"name":"Xilin","codes":["DT36"],"lines":["DTL"],"status":"future","expectedYear":2026,"approximate":true,"lat":1.32873,"lng":103.96487},
  {"name":"Choa Chu Kang West","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.37922,"lng":103.74003},
  {"name":"Tengah","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.36638,"lng":103.73009},
  {"name":"Hong Kah","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.35809,"lng":103.72611},
  {"name":"Corporation","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.35297,"lng":103.71381},
  {"name":"Jurong West","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.34919,"lng":103.70826},
  {"name":"Bahar Junction","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.34619,"lng":103.70303},
  {"name":"Gek Poh","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.34835,"lng":103.69812},
  {"name":"Tawas","codes":[],"lines":["JRL"],"status":"future","expectedYear":2027,"approximate":true,"lat":1.35066,"lng":103.69189},
  {"name":"Tengah Plantation","codes":[],"lines":["JRL"],"status":"future","expectedYear":2028,"approximate":true,"lat":1.35733,"lng":103.73345},
  {"name":"Tengah Park","codes":[],"lines":["JRL"],"status":"future","expectedYear":2028,"approximate":true,"lat":1.35233,"lng":103.73679},
  {"name":"Bukit Batok West","codes":[],"lines":["JRL"],"status":"future","expectedYear":2028,"approximate":true,"lat":1.34567,"lng":103.73950},
  {"name":"Toh Guan","codes":[],"lines":["JRL"],"status":"future","expectedYear":2028,"approximate":true,"lat":1.33991,"lng":103.74250},
  {"name":"Jurong Town Hall","codes":[],"lines":["JRL"],"status":"future","expectedYear":2028,"approximate":true,"lat":1.32638,"lng":103.74521},
  {"name":"Pandan Reservoir","codes":[],"lines":["JRL"],"status":"future","expectedYear":2028,"approximate":true,"lat":1.32046,"lng":103.74480},
  {"name":"Enterprise","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.33273,"lng":103.70858},
  {"name":"Tukang","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.32541,"lng":103.70925},
  {"name":"Jurong Hill","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.31862,"lng":103.71013},
  {"name":"Jurong Pier","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.31313,"lng":103.71040},
  {"name":"Nanyang Gateway","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.35369,"lng":103.68660},
  {"name":"Nanyang Crescent","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.34841,"lng":103.68081},
  {"name":"Peng Kang Hill","codes":[],"lines":["JRL"],"status":"future","expectedYear":2029,"approximate":true,"lat":1.34321,"lng":103.67856},
  {"name":"Aviation Park","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.37021,"lng":104.00351},
  {"name":"Loyang","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.37114,"lng":103.97192},
  {"name":"Pasir Ris East","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.36702,"lng":103.96058},
  {"name":"Tampines North","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.36946,"lng":103.93813},
  {"name":"Defu","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.36234,"lng":103.89900},
  {"name":"Serangoon North","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.37060,"lng":103.87379},
  {"name":"Tavistock","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.37019,"lng":103.86325},
  {"name":"Teck Ghee","codes":[],"lines":["CRL"],"status":"future","expectedYear":2030,"approximate":true,"lat":1.36542,"lng":103.84352}
]
```

Caveats on the seed:
- **The JRL and CRL years (2027/2028/2029/2030) are UNVERIFIED** (§4.3–4.4). Before shipping, either verify them or render them as "planned (LTA target ~YYYY)".
- Future lines at existing interchanges are omitted from the seed. These are JRL at Choa Chu Kang, Boon Lay and Jurong East; CRL at Pasir Ris, Hougang, Ang Mo Kio and Bright Hill; and the TEL5 and DTL3e interchange at Sungei Bedok, which *is* included because it is a new station. **Model future lines at an existing station by adding `"JRL"` or `"CRL"` to a separate `futureLines` field.** Do not create a duplicate station, or "nearest MRT" will double-count.
- **Never seed stations with `null` coordinates.**

---

## 5. Data sources for station coordinates

### 5.1 LTA MRT Station Exit (GEOJSON): **recommended** for operating stations [PRIMARY]

- **Dataset ID** `d_b39d3a0871985372d7e1637193335da5`, collection `367`. Page: https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view. A KML twin exists (`d_f820139ee3b0865b5512cf61ab7d1122`); do not use it.
- **Retrieval:** `GET https://api-open.data.gov.sg/v1/public/api/datasets/d_b39d3a0871985372d7e1637193335da5/poll-download`. It returns `{"code":0,"data":{"url":"<signed S3 URL>"},"errorMsg":""}`. Geospatial datasets omit `data.status`, so treat "`data.url` present" as ready. GET that URL **without** the `x-api-key` header; it is short-lived, so on a 403, poll again. Full API details are in `docs/research/datagov-api.md` §3 and §5.6.
- **Geometry:** `Point`, `[lng, lat]` in WGS84.
- **`properties`:** `OBJECTID`, `STATION_NA`, `EXIT_CODE`, `INC_CRC`, `FMEL_UPD_D` (`yyyyMMddHHmmss`).
  - Example: `{"STATION_NA":"ADMIRALTY MRT STATION","EXIT_CODE":"Exit A", ...}` at `[103.80099, 1.440346]`.
- **There is no line or code field.** Join to the §3.1 table on the normalised name: upper case, with ` MRT STATION` / ` LRT STATION` stripped and whitespace trimmed.
- **Pitfalls observed in the 2026-07-17 data** (third-party build log, cross-checked against OneMap):
  1. **Code-only `STATION_NA` values:** `CC9` (Paya Lebar), `DT18` (Telok Ayer), `DT4` (Hume), `NE18` (Punggol Coast), `CC30` (Keppel), `CC31` (Cantonment), `CC32` (Prince Edward Road).
     - Map them with a code → name table, which §3 provides.
     - Assert at ingest that no unmapped `^[A-Z]{2,3}\d+$` names remain.
  2. **The same station can appear as both MRT and LRT:** `BUKIT PANJANG MRT STATION` and `BUKIT PANJANG LRT STATION`, `CHOA CHU KANG MRT/LRT STATION`, `PUNGGOL MRT/LRT STATION`. Merge them by base name.
  3. **The dataset includes the unopened `MARINA SOUTH MRT STATION`** (TE21). Use an explicit allow-list of operating names (§3.1); do not treat "every name in the dataset" as operational.
  4. **`EXIT_CODE` formats vary:** `"Exit A"`, `"Exit 1"`, and plain `"1"`/`"2"` (Punggol Coast).
  5. **Duplicate exit codes within a station occur.** Examples: Bukit Panjang MRT has `Exit A` three times; Expo, HarbourFront and Choa Chu Kang also repeat codes. Do not key on `(station, exit)` uniquely.
- **Expected counts at ingest** (snapshot of 2026-10-01): 613 features and 188 `STATION_NA` groups after mapping the code-only names. That is 184 operating names, plus 3 MRT/LRT duplicates, plus Marina South.
  - Assert 600–700 features and an operating-name match of 184/184.
  - When TEL5 and DTL3e open, expect +3 names: Bedok South, Sungei Bedok and Xilin. Their exits may appear **before** opening, so status must come from the allow-list, not from presence in the data.

### 5.2 URA Master Plan 2019 Rail Station layer (GEOJSON): **for future stations** [PRIMARY]

- **Dataset ID** `d_8d886e3a83934d7447acdf5bc6959999`. Page: https://data.gov.sg/datasets/d_8d886e3a83934d7447acdf5bc6959999/view. Retrieve it with poll-download as in §5.1.
- **Features:** 257 `Polygon`/`MultiPolygon` features in WGS84.
- **`properties`:** `OBJECTID`, `NAME`, `RAIL_TYPE` (`MRT`/`LRT`), `GRND_LEVEL` (`ABOVEGROUND`/`UNDERGROUND`), `INC_CRC`, `FMEL_UPD_D`, `SHAPE.AREA`, `SHAPE.LEN`.
  - Example: `{"NAME":"PUNGGOL CENTRAL","RAIL_TYPE":"LRT","GRND_LEVEL":"ABOVEGROUND","FMEL_UPD_D":"20191209180316",...}`.
- **Pitfalls:**
  1. `NAME` has **no** `MRT STATION` suffix. Some names have trailing spaces: `"PANDAN RESERVOIR "`, `"MARYMOUNT "`, `"MARINA SOUTH PIER "`, `"TIONG BAHRU "`, `"MATTAR "`. Trim them.
  2. **Interchanges use different names:** `"<X> INTERCHANGE"` (for example `ANG MO KIO INTERCHANGE`, `BRIGHT HILL INTERCHANGE`) and `PUNGGOL CENTRAL` / `SENGKANG CENTRAL` for the LRT hubs.
  3. **There are spelling differences against LTA:** `JELEPANG` (LTA: Jelapang), `SUM KEE` (LTA: Sam Kee), `ONE NORTH` (LTA: one-north), `BUGIS MRT`, `WOODLANDS NORTH STATION`. Fort Canning (DT20) appears as `RIVER VALLEY`.
  4. **Some features have `NAME` = `null` or `"<Null>"`.** One `<Null>` polygon at about 1.27420, 103.86308 is the Marina South TE21 box. Three `null` LRT polygons at about 1.252–1.255, 103.818–103.821, on Sentosa, are almost certainly **Sentosa Express**, which is not part of the LTA MRT/LRT network. Five other `null` MRT polygons sit at existing city-centre stations. **Drop all null-named features.**
  5. **The layer reflects the 2019 plan.** It lacks Brickland, Sungei Kadut, the DTL-extension stations, CRL Phase 2, the CRL Punggol extension and T5.
- **Centroid method:** area-weighted shoelace centroid of each polygon's outer ring, averaged across a station's parts and weighted by area. Use only the `UNDERGROUND` part when a new underground line is being added at an existing elevated station, for example the CRL at Pasir Ris and Ang Mo Kio.

### 5.3 URA "Amendment to Master Plan 2019 Rail Station layer" [PRIMARY; content not inspected]

- **Dataset ID** `d_9a6bdc9d93bd041eb0cfbb6a8cb3248f`. The search index says "Data from Sep 2025"; see `docs/research/datagov-api.md`.
- It may contain the stations announced after 2019: Brickland, Sungei Kadut, the DTL extension and CRL Phase 2. **Ingest it and diff it against §5.2** before deciding `null` coordinates are final. UNVERIFIED.

### 5.4 OneMap Search (cross-check or fallback, one station at a time)

```
GET https://www.onemap.gov.sg/api/common/elastic/search?searchVal=KEPPEL%20MRT%20STATION&returnGeom=Y&getAddrDetails=Y&pageNum=1
Authorization: <token>   # a token is now required; see docs/research/onemap-api.md §1.2
```

- **Response fields:** `found`, `totalNumPages`, `pageNum`, `results[]` with `SEARCHVAL`, `BLK_NO`, `ROAD_NAME`, `BUILDING`, `ADDRESS`, `POSTAL`, `X`, `Y`, `LATITUDE`, `LONGITUDE`. All values are strings; parse them with `parseFloat`.
- **Station POIs are labelled with the line code in parentheses.** A third party observed the following on 2026-10-02 (`WeeJC8954/sg-smart-commute` asset): `"PAYA LEBAR MRT STATION (CC9)"`, `"TELOK AYER MRT STATION (DT18)"`, `"HUME MRT STATION (DT4)"`, `"PUNGGOL COAST MRT STATION (NE18)"`, `"KEPPEL MRT STATION (CC30)"`, `"CANTONMENT MRT STATION (CC31)"`, `"PRINCE EDWARD ROAD MRT STATION (CC32)"`. These POIs sat 41–85 m from the LTA exit centroid.
  - Expect **one POI per line code** at interchanges (UNVERIFIED for all stations). Exit POIs may also be returned. Filter on `SEARCHVAL` matching `^<NAME> (MRT|LRT) STATION \(` .
- **Whether OneMap returns unopened stations** (TEL5, JRL, CRL) is UNVERIFIED; do not rely on it for future stations.
- Rate limit and token rules are in `docs/research/onemap-api.md`.

### 5.5 LTA DataMall static geospatial files (alternative; not reachable from this container)

These are listed on https://datamall.lta.gov.sg/content/datamall/en/static-data.html (per the sgraildata README):
- **Station point layer:** `https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation_Apr2025.zip`. This is a shapefile in SVY21 (EPSG:3414), so reproject it to EPSG:4326. Its attributes are `STN_NAME` and `STN_NO` [PRIMARY-DATA, older export]. The April 2025 vintage **predates CCL6** and still uses CE1/CE2.
- **"Train Station Codes and Chinese Names"** XLS: `https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/Train%20Station%20Codes%20and%20Chinese%20Names.zip`.
- **Prefer §5.1 plus the hand-curated code table in §3.1.**

---

## 6. Recommended implementation (summary for engineers)

1. **Ship §3.1 as the curated operating-station table**: name, codes, lines and the LTA exit-centroid lat/lng. At ingest, recompute lat/lng from §5.1 and fail the build if any of the 184 names is missing or moves more than 300 m.
2. **Ship §4.9 as the future-station seed**, plus a `futureLines` annotation on existing interchanges: JRL at Choa Chu Kang, Boon Lay and Jurong East; CRL at Pasir Ris, Hougang, Ang Mo Kio and Bright Hill. Recompute coordinates from §5.2 at ingest.
3. **"Nearest MRT" must use `status === "operational"` only.**
   - Explicitly exclude Marina South (TE21), Mount Pleasant (TE10), Bukit Brown (CC18) and the TEL5/DTL3e stations until LTA opens them.
   - Show "upcoming MRT" separately, with the expected year and the label "LTA target". Add "(subject to change)" for UNVERIFIED years.
4. **Before each deploy, re-check:**
   - Has TEL5/DTL3e opened? Then flip Bedok South, Sungei Bedok and Xilin to operational.
   - Did LTA confirm the codes for JRL, CRL, Brickland and the DTL extension?
   - Has the T5 or Changi branch conversion been announced?

---

## 7. Open items / UNVERIFIED (must be confirmed against LTA before being stated as fact)

1. The exact opening dates of TEL4 (23 Jun 2024), Teck Lee (15 Aug 2024), Punggol Coast (10 Dec 2024) and Hume (28 Feb 2025). All four stations are confirmed open by the LTA data.
2. JRL station codes and stage years (2027/2028/2029), and any revision announced in 2025–2026.
3. CRL Phase 1 year (2030), CRL Punggol extension (2032), CRL Phase 2 (2032), all CRL codes, and the CPE station names (Elias, Riviera).
4. The station names and codes in the January 2025 "three new stations … by 2035" announcement (Sungei Kadut interchange and the DTL-extension station names), plus Brickland's year (2034?) and code (NS3A?).
5. Founders' Memorial station: its code (TE22A?) and year.
6. Opening plans for Mount Pleasant TE10, Marina South TE21 and Bukit Brown CC18.
7. The exact TEL5/DTL3e opening date: still "2H 2026" as of 2026-10-08.
8. The post-CCL6 service pattern and the CE→CC code change, which have not been read on an LTA page.
9. Operator names and line colour hex values.

---

## 8. Sources

**LTA and government pages.** These were listed by the search engine; page bodies were not fetched.
- LTA, 14 May 2026, "Circle Line Stage 6 to Open for Public Preview on 4 July 2026": https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/5/news-releases/circle-line-stage-6-to-open-for-public-preview-on-4-july-2026.html
- LTA, Jun 2026, "Explore three new Circle Line Stage 6 stations on 4 July 2026": https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/6/news-releases/explore-three-new-circle-line-stage-6-stations-on-4-july-2026.html
- LTA project page, CCL6: https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/circle_line_6.html
- LTA project page, DTL2 and DTL3 extensions: https://www.lta.gov.sg/content/ltagov/en/upcoming_projects/rail_expansion/downtown_line_2_and_3_extensions.html
- LTA, Jan 2025, three new stations: https://www.lta.gov.sg/content/ltagov/en/newsroom/2025/1/news-releases/three_new_stations_to_connect.html
- LTA, Mar 2024, TEL4: https://www.lta.gov.sg/content/ltagov/en/newsroom/2024/3/news-releases/TEL4_to_welcome_commuters.html

**Data.** All of the following were downloaded and inspected:
- URA MP2019 Rail Station layer (data.gov.sg `d_8d886e3a83934d7447acdf5bc6959999`), mirror: https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/raw/master-plan-2019-rail-station-layer-geojson.geojson
- LTA station point codes (`STN_NAME`/`STN_NO`), mirror: https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/raw/MRTLRTStnPtt.json
- LTA MRT Station Exit, grouped snapshot of 2026-10-01: https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/assets/mrt_stations.json and https://raw.githubusercontent.com/WeeJC8954/sg-smart-commute/HEAD/docs/data-sources.md
- sgraildata v5.1.0 (RailRouter SG): https://raw.githubusercontent.com/cheeaun/sgraildata/master/data/v1/sg-rail.geojson, CHANGELOG https://raw.githubusercontent.com/cheeaun/sgraildata/master/CHANGELOG.md and README https://raw.githubusercontent.com/cheeaun/sgraildata/master/README.md
- data.gov.sg dataset pages: https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view, https://data.gov.sg/collections/367/view and https://data.gov.sg/datasets/d_8d886e3a83934d7447acdf5bc6959999/view

**Secondary sources.** These were used only through search summaries:
- Land Transport Guru: https://landtransportguru.net/circle-line-6-opening/ and https://landtransportguru.net/circle-line-stage-6-start-service-12jul26/
- sgtrains: https://blog.sgtrains.com/2026/05/circle-line-stage-6-to-open-on-jul-12-2026-public-preview-for-3-new-stations-on-jul-4/
- Wikipedia: https://en.wikipedia.org/wiki/Circle_Line_(Singapore), https://en.wikipedia.org/wiki/Sungei_Bedok_MRT_station, https://en.wikipedia.org/wiki/Xilin_MRT_station, https://en.wikipedia.org/wiki/Bedok_South_MRT_station, https://en.wikipedia.org/wiki/Downtown_Line and https://en.wikipedia.org/wiki/DE1_MRT_station
- AsiaOne: https://www.asiaone.com/singapore/3-new-mrt-stations-including-new-interchange-connecting-downtown-line-and-north-south-line-2035-lta
- TEL5 status as of 8 Oct 2026: https://bedoksouthmrtcondo.com/insights/bedok-south-mrt-completion-date-timeline/ and https://bayshore.sg/guides/bedok-south-mrt-bayshore-2026/
- https://thesmartlocal.com/read/dtl-extension-2026/

