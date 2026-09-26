"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import GardenMap, { type MapZone } from "./GardenMap";

type ZoneId = "butterfly" | "grove" | "lake" | "sky" | "amphitheatre";

type Species = {
  id: string;
  zone: Exclude<ZoneId, "amphitheatre">;
  name: string;
  scientific: string;
  icon: string;
  assetPath?: string;
  fact: string;
  x: number;
  y: number;
  label: string;
};

const MAP_ZONES: MapZone[] = [
  { id: "butterfly", name: "Butterfly Beds", shortName: "Petal", icon: "✿", color: "#e96f5d", anchor: [-35, 15, 5] },
  { id: "grove", name: "Whispering Grove", shortName: "Canopy", icon: "♣", color: "#4d8b5c", anchor: [-70, 18, -45] },
  { id: "lake", name: "Ripple Lake", shortName: "Water", icon: "≈", color: "#3c91a1", anchor: [58, 14, 35] },
  { id: "sky", name: "Palm Skyway", shortName: "Sky", icon: "↑", color: "#e1a944", anchor: [108, 21, 20] },
  { id: "amphitheatre", name: "Echo Amphitheatre", shortName: "Finale", icon: "✦", color: "#8d6ac7", anchor: [5, 16, -56] },
];

const ZONE_COPY: Record<ZoneId, { prompt: string; task: string; token: string }> = {
  butterfly: { prompt: "Wake the flower beds.", task: "Tap all three flowers.", token: "Petal Song" },
  grove: { prompt: "Who lives in the leaves?", task: "Find three canopy neighbours.", token: "Canopy Song" },
  lake: { prompt: "Look softly by the water.", task: "Spot two quiet residents.", token: "Water Song" },
  sky: { prompt: "Follow the palms from day to dusk.", task: "Meet three sky neighbours.", token: "Sky Song" },
  amphitheatre: { prompt: "Bring the four songs home.", task: "Wake the living map.", token: "Garden Song" },
};

const SPECIES: Species[] = [
  { id: "plain-tiger", zone: "butterfly", name: "Plain Tiger", scientific: "Danaus chrysippus", icon: "🦋", assetPath: "/assets/species/plain-tiger.webp", fact: "Its orange wings warn birds that it tastes unpleasant.", x: 31, y: 45, label: "orange butterfly" },
  { id: "blue-mormon", zone: "butterfly", name: "Blue Mormon", scientific: "Papilio polymnestor", icon: "🦋", assetPath: "/assets/species/blue-mormon.webp", fact: "One of Maharashtra’s largest butterflies, often seen near flowering plants.", x: 72, y: 37, label: "blue butterfly" },
  { id: "banyan", zone: "grove", name: "Banyan", scientific: "Ficus benghalensis", icon: "🌳", fact: "Its hanging roots can become new trunks and shelter a whole neighbourhood.", x: 28, y: 53, label: "banyan tree" },
  { id: "peepal", zone: "grove", name: "Peepal", scientific: "Ficus religiosa", icon: "🍃", fact: "Its heart-shaped leaves quiver even in a very light breeze.", x: 67, y: 39, label: "peepal leaves" },
  { id: "spotted-owlet", zone: "grove", name: "Spotted Owlet", scientific: "Athene brama", icon: "🦉", fact: "It often rests in tree hollows by day and becomes busy after sunset.", x: 51, y: 27, label: "spotted owlet" },
  { id: "kingfisher", zone: "lake", name: "Common Kingfisher", scientific: "Alcedo atthis", icon: "🐦", fact: "A flash of blue above the water can be this tiny, fast fisher.", x: 36, y: 34, label: "kingfisher" },
  { id: "turtle", zone: "lake", name: "Flapshell Turtle", scientific: "Lissemys punctata", icon: "🐢", fact: "It can close skin flaps over its legs when it tucks into its shell.", x: 70, y: 63, label: "flapshell turtle" },
  { id: "royal-palm", zone: "sky", name: "Royal Palm", scientific: "Roystonea regia", icon: "🌴", fact: "Its tall smooth trunk makes a favourite lookout and resting place.", x: 26, y: 49, label: "royal palm" },
  { id: "black-kite", zone: "sky", name: "Black Kite", scientific: "Milvus migrans", icon: "🪶", fact: "It circles on warm rising air, steering with its forked tail.", x: 61, y: 28, label: "black kite" },
  { id: "flying-fox", zone: "sky", name: "Flying Fox", scientific: "Pteropus giganteus", icon: "🦇", fact: "This fruit bat helps forests by carrying pollen and seeds at night.", x: 76, y: 48, label: "flying fox bat" },
];

const REQUIRED_ZONE_IDS: Array<Exclude<ZoneId, "amphitheatre">> = ["butterfly", "grove", "lake", "sky"];
const SPECIES_IDS = new Set(SPECIES.map((item) => item.id));
const SONG_IDS = new Set<string>(REQUIRED_ZONE_IDS);

function sanitizeIds(value: unknown, allowed: Set<string>) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))];
}

const ROOM_SPECIES = (zone: ZoneId) => SPECIES.filter((item) => item.zone === zone);

function SpeciesArtwork({ species, className }: { species: Species; className: string }) {
  const [assetFailed, setAssetFailed] = useState(false);

  if (!species.assetPath || assetFailed) {
    return (
      <span className={`${className} species-art-fallback`} role="img" aria-label={species.label}>
        {species.icon}
      </span>
    );
  }

  return (
    <span className={className}>
      {/* The image is decorative because its surrounding control or card names the species. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="species-art-image"
        src={species.assetPath}
        alt=""
        draggable={false}
        onError={() => setAssetFailed(true)}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
      />
    </span>
  );
}

function Bee({ small = false }: { small?: boolean }) {
  return (
    <span className={`mitra-bee ${small ? "small" : ""}`} aria-label="Mitra the bee" role="img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="mitra-bee-image"
        src="/assets/characters/mitra.webp"
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
      />
    </span>
  );
}

function playChime(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const context = new AudioCtx();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
  gain.connect(context.destination);
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.08);
    oscillator.stop(context.currentTime + 0.6);
  });
  window.setTimeout(() => void context.close(), 800);
}

type RoomProps = {
  zone: ZoneId;
  discovered: string[];
  songs: string[];
  finaleComplete: boolean;
  onBack: () => void;
  onDiscover: (species: Species) => void;
  onFinale: () => void;
};

function HabitatRoom({ zone, discovered, songs, finaleComplete, onBack, onDiscover, onFinale }: RoomProps) {
  const [blooms, setBlooms] = useState<number[]>([]);
  const [time, setTime] = useState<"day" | "dusk">("day");
  const roomSpecies = ROOM_SPECIES(zone);
  const foundHere = roomSpecies.filter((item) => discovered.includes(item.id)).length;
  const unlockedButterflies = zone !== "butterfly" || blooms.length === 3;
  const finaleReady = REQUIRED_ZONE_IDS.every((id) => songs.includes(id));

  if (zone === "amphitheatre") {
    return (
      <section className={`habitat-room room-amphitheatre ${finaleComplete ? "finale-awake" : ""}`} aria-label="Echo Amphitheatre">
        <RoomTopbar title="Echo Amphitheatre" found={`${songs.length}/4 songs`} onBack={onBack} />
        <div className="amphitheatre-stage">
          <div className="stage-rings"><span /><span /><span /></div>
          <div className="song-orbit" aria-label={`${songs.length} habitat songs collected`}>
            {MAP_ZONES.slice(0, 4).map((item) => (
              <span key={item.id} className={songs.includes(item.id) ? "song-lit" : ""}>{item.icon}</span>
            ))}
          </div>
          <Bee />
          <h2>{finaleComplete ? "The garden is singing!" : finaleReady ? "Ready?" : "Four songs open this stage."}</h2>
          {finaleReady && !finaleComplete && <button className="room-primary" onClick={onFinale}>Wake the garden</button>}
          {finaleComplete && <button className="room-primary" onClick={onBack}>Back to the map</button>}
        </div>
      </section>
    );
  }

  return (
    <section className={`habitat-room room-${zone} room-time-${time}`} aria-label={MAP_ZONES.find((item) => item.id === zone)?.name}>
      <RoomTopbar
        title={MAP_ZONES.find((item) => item.id === zone)?.name ?? "Garden room"}
        found={`${foundHere}/${roomSpecies.length} found`}
        onBack={onBack}
      />
      <div className="room-task"><Bee small /><span>{zone === "butterfly" && !unlockedButterflies ? ZONE_COPY[zone].task : ZONE_COPY[zone].prompt}</span></div>
      <div className="room-scenery" aria-label="Interactive habitat scene">
        <div className="far-hills" /><div className="room-sun" /><div className="room-ground" />
        {zone === "butterfly" && [0, 1, 2].map((flower) => (
          <button
            key={flower}
            className={`flower flower-${flower + 1} ${blooms.includes(flower) ? "flower-awake" : ""}`}
            type="button"
            aria-label={`Wake flower ${flower + 1}`}
            aria-pressed={blooms.includes(flower)}
            onClick={() => setBlooms((current) => current.includes(flower) ? current : [...current, flower])}
          ><span>✿</span></button>
        ))}
        {zone === "grove" && <><div className="scene-tree tree-one" /><div className="scene-tree tree-two" /><div className="scene-tree tree-three" /></>}
        {zone === "lake" && <><div className="scene-reeds reeds-one" /><div className="scene-reeds reeds-two" /><div className="scene-water" /></>}
        {zone === "sky" && (
          <>
            <div className="palm-row"><i /><i /><i /><i /><i /></div>
            <div className="time-switch" role="group" aria-label="Choose time of day">
              <button className={time === "day" ? "active" : ""} aria-pressed={time === "day"} onClick={() => setTime("day")}>Day</button>
              <button className={time === "dusk" ? "active" : ""} aria-pressed={time === "dusk"} onClick={() => setTime("dusk")}>Dusk</button>
            </div>
          </>
        )}

        {unlockedButterflies && roomSpecies.map((species) => {
          const timeHidden = zone === "sky" && ((species.id === "flying-fox" && time !== "dusk") || (species.id === "black-kite" && time !== "day"));
          if (timeHidden) return null;
          return (
            <button
              key={species.id}
              type="button"
              className={`species-hotspot species-${species.id} ${discovered.includes(species.id) ? "species-found" : ""}`}
              style={{ left: `${species.x}%`, top: `${species.y}%` }}
              aria-label={`Discover ${species.name}`}
              onClick={() => onDiscover(species)}
            >
              <SpeciesArtwork species={species} className="species-emoji" />
              <span className="species-name">{discovered.includes(species.id) ? species.name : "?"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RoomTopbar({ title, found, onBack }: { title: string; found: string; onBack: () => void }) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
  }, []);
  return (
    <header className="room-topbar">
      <button ref={backRef} type="button" className="round-button" onClick={onBack} aria-label="Back to map">←</button>
      <h1>{title}</h1>
      <span className="room-count">{found}</span>
    </header>
  );
}

function useModalFocus() {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      returnFocusRef.current?.focus();
    };
  }, []);

  return { closeRef, dialogRef };
}

function FieldNoteModal({ species, onClose }: { species: Species; onClose: () => void }) {
  const { closeRef, dialogRef } = useModalFocus();
  return (
    <div className="modal-backdrop">
      <article ref={dialogRef} className="field-card" role="dialog" aria-modal="true" aria-labelledby="field-card-title">
        <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close field note">×</button>
        <SpeciesArtwork key={species.id} species={species} className="field-card-icon" />
        <small>Field note added</small>
        <h2 id="field-card-title">{species.name}</h2>
        <em>{species.scientific}</em>
        <p>{species.fact}</p>
        <button className="room-primary" onClick={onClose}>Keep exploring</button>
      </article>
    </div>
  );
}

function JournalModal({
  discovered,
  onClose,
  onReset,
}: {
  discovered: string[];
  onClose: () => void;
  onReset: () => void;
}) {
  const { closeRef, dialogRef } = useModalFocus();
  return (
    <div className="modal-backdrop journal-backdrop">
      <section ref={dialogRef} className="journal" role="dialog" aria-modal="true" aria-labelledby="journal-title">
        <header>
          <div><small>Field Journal</small><h2 id="journal-title">Garden neighbours</h2></div>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close journal">×</button>
        </header>
        <div className="journal-grid">
          {SPECIES.map((species) => {
            const found = discovered.includes(species.id);
            return (
              <article key={species.id} className={found ? "journal-card found" : "journal-card"}>
                {found ? <SpeciesArtwork species={species} className="journal-species-art" /> : <span>?</span>}
                <b>{found ? species.name : "Undiscovered"}</b>
                <small>{found ? species.scientific : "Keep looking"}</small>
              </article>
            );
          })}
        </div>
        <button className="reset-button" onClick={onReset}>Reset progress</button>
      </section>
    </div>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<"intro" | "map" | "room">("intro");
  const [selectedZone, setSelectedZone] = useState<ZoneId>("butterfly");
  const [activeZone, setActiveZone] = useState<ZoneId>("butterfly");
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [songs, setSongs] = useState<string[]>([]);
  const [journalOpen, setJournalOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<Species | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [finaleComplete, setFinaleComplete] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem("aditi-living-map-v2");
        if (saved) {
          const state = JSON.parse(saved) as { discovered?: unknown; songs?: unknown; finaleComplete?: boolean };
          setDiscovered(sanitizeIds(state.discovered, SPECIES_IDS));
          setSongs(sanitizeIds(state.songs, SONG_IDS));
          setFinaleComplete(Boolean(state.finaleComplete));
        }
      } catch { /* a corrupt save simply starts a fresh trail */ }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem("aditi-living-map-v2", JSON.stringify({ discovered, songs, finaleComplete }));
    } catch { /* private browsing and strict storage settings are supported */ }
  }, [discovered, songs, finaleComplete, hydrated]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeCard) setActiveCard(null);
      else if (journalOpen) setJournalOpen(false);
      else if (phase === "room") setPhase("map");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeCard, journalOpen, phase]);

  const selected = useMemo(() => MAP_ZONES.find((zone) => zone.id === selectedZone)!, [selectedZone]);
  const finaleReady = REQUIRED_ZONE_IDS.every((id) => songs.includes(id));
  const amphitheatreLocked = selectedZone === "amphitheatre" && !finaleReady;

  const enterZone = () => {
    if (amphitheatreLocked) return;
    setActiveZone(selectedZone);
    setPhase("room");
  };

  const discover = (species: Species) => {
    const nextDiscovered = discovered.includes(species.id) ? discovered : [...discovered, species.id];
    setDiscovered(nextDiscovered);
    const zoneTargets = ROOM_SPECIES(species.zone).map((item) => item.id);
    if (zoneTargets.every((id) => nextDiscovered.includes(id)) && !songs.includes(species.zone)) {
      setSongs((current) => [...current, species.zone]);
    }
    setActiveCard(species);
    playChime(soundOn);
  };

  const resetProgress = () => {
    setDiscovered([]);
    setSongs([]);
    setFinaleComplete(false);
    setJournalOpen(false);
    setPhase("map");
  };

  return (
    <main className="game-shell">
      <section className="world-layer" aria-hidden={phase !== "map" || Boolean(activeCard) || journalOpen} inert={phase !== "map" || Boolean(activeCard) || journalOpen}>
        <GardenMap
          zones={MAP_ZONES}
          selectedZone={selectedZone}
          completedZones={songs}
          lockedZoneIds={finaleReady ? [] : ["amphitheatre"]}
          active={phase === "map" && !activeCard && !journalOpen}
          onSelectZone={(id) => setSelectedZone(id as ZoneId)}
        />
        <header className="game-topbar">
          <div className="game-brand"><span>A</span><b>Aditi Garden</b></div>
          <div className="song-tracker" aria-label={`${songs.length} of 4 habitat songs found`}>
            {MAP_ZONES.slice(0, 4).map((zone) => <i key={zone.id} className={songs.includes(zone.id) ? "song-found" : ""}>{zone.icon}</i>)}
          </div>
          <div className="top-actions">
            <button type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? "Mute sounds" : "Turn on sounds"}>{soundOn ? "♪" : "×"}</button>
            <button type="button" onClick={() => setJournalOpen(true)}>Journal <span>{discovered.length}/{SPECIES.length}</span></button>
          </div>
        </header>

        {phase === "map" && (
          <aside className="destination-card" aria-live="polite">
            <div className="destination-icon" style={{ background: selected.color }}>{selected.icon}</div>
            <div><small>{ZONE_COPY[selectedZone].token}</small><h2>{selected.name}</h2><p>{amphitheatreLocked ? `${REQUIRED_ZONE_IDS.filter((id) => !songs.includes(id)).length} songs still missing.` : ZONE_COPY[selectedZone].prompt}</p></div>
            <button type="button" onClick={enterZone} disabled={amphitheatreLocked}>{amphitheatreLocked ? "Locked" : "Enter"} <span>→</span></button>
          </aside>
        )}
      </section>

      {phase === "intro" && (
        <section className="intro-overlay">
          <div className="intro-card">
            <Bee />
            <small>Aditi Garden</small>
            <h1>The Living Map</h1>
            <p>Find four habitat songs.</p>
            <button type="button" onClick={() => setPhase("map")}>Explore <span>→</span></button>
          </div>
        </section>
      )}

      {phase === "room" && (
        <div className="room-layer" aria-hidden={Boolean(activeCard) || journalOpen} inert={Boolean(activeCard) || journalOpen}>
          <HabitatRoom
            key={activeZone}
            zone={activeZone}
            discovered={discovered}
            songs={songs}
            finaleComplete={finaleComplete}
            onBack={() => setPhase("map")}
            onDiscover={discover}
            onFinale={() => { setFinaleComplete(true); playChime(soundOn); }}
          />
        </div>
      )}

      {activeCard && <FieldNoteModal species={activeCard} onClose={() => setActiveCard(null)} />}

      {journalOpen && <JournalModal discovered={discovered} onClose={() => setJournalOpen(false)} onReset={resetProgress} />}
    </main>
  );
}
