import {
  Activity,
  BarChart3,
  Check,
  Clock3,
  Crown,
  Database,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { fetchForecast, submitPrediction } from "./api";

const FINAL_KICKOFF = "2026-05-30T18:00:00+02:00";
const LOCAL_PREDICTIONS_KEY = "ucl-predictor-local-predictions-v2";
const FINAL_SIDE_A = new Set(["psg", "bayern"]);
const FINAL_SIDE_B = new Set(["arsenal", "atleti"]);
const UCL_LOGO_URL = "https://upload.wikimedia.org/wikipedia/en/6/6f/UEFA_Champions_League_logo.svg";
const UCL_TROPHY_URL = "https://upload.wikimedia.org/wikipedia/en/8/8f/UEFA_Champions_League_Trophy_-_cropped.jpg";
const UCL_ANTHEM_URL = "https://www.uefa.com/uefachampionsleague/news/022d-0e1636f1244a-c916aa410dad-1000--champions-league-anthem/";

const fallbackData = {
  model: {
    verifiedDate: "2026-04-27",
    stage: "Semi-finals",
    final: "30 May 2026 • Puskás Aréna, Budapest",
    favorite: "Bayern München",
    runnerUp: "Arsenal",
    summary:
      "Bayern and PSG are intentionally weighted as the two strongest contenders. Bayern narrowly lead PSG due to the head-to-head edge, Real Madrid knockout result, and a more balanced attack-defense profile."
  },
  matches: [],
  teams: [],
  sources: [],
  predictionCount: null,
  sheetsStatus: "loading"
};

function App() {
  const [data, setData] = useState(fallbackData);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [form, setForm] = useState({
    name: "",
    champion: "Bayern München",
    runnerUp: "Arsenal",
    confidence: 72,
    reason: ""
  });
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [localPredictions, setLocalPredictions] = useState(() => readLocalPredictions());

  useEffect(() => {
    fetchForecast()
      .then((forecast) => {
        setData(forecast);
        if (forecast.teams?.length) {
          setForm((current) => ({
            ...current,
            champion: forecast.model.favorite,
            runnerUp: forecast.model.runnerUp
          }));
        }
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_PREDICTIONS_KEY, JSON.stringify(localPredictions));
  }, [localPredictions]);

  const teams = data.teams || [];
  const matches = data.matches || [];
  const teamById = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team])), [teams]);
  const favorite = useMemo(() => teams.find((team) => team.name === data.model.favorite) || teams[0], [teams, data.model.favorite]);
  const selectedChampion = teams.find((team) => team.name === form.champion);
  const runnerUpOptions = useMemo(() => getFinalOpponentOptions(form.champion, teams), [form.champion, teams]);
  const finalCountdown = getCountdownParts(new Date(FINAL_KICKOFF).getTime(), now);
  const fanVoteCount = (data.predictionCount || 0) + localPredictions.length;

  const voteTally = useMemo(() => {
    const counts = Object.fromEntries(teams.map((team) => [team.name, 0]));
    localPredictions.forEach((prediction) => {
      if (counts[prediction.champion] !== undefined) counts[prediction.champion] += 1;
    });
    return teams
      .map((team) => ({ team, count: counts[team.name] || 0 }))
      .sort((a, b) => b.count - a.count || b.team.probability - a.team.probability);
  }, [teams, localPredictions]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "confidence" ? Number(value) : value
    }));
  }

  function selectChampion(team) {
    setForm((current) => ({
      ...current,
      champion: team.name,
      runnerUp: getFinalOpponentOptions(team.name, teams).some((opponent) => opponent.name === current.runnerUp)
        ? current.runnerUp
        : getFinalOpponentOptions(team.name, teams)[0]?.name || ""
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");

    if (!form.champion || !form.runnerUp) {
      setStatus("Pick a champion and final opponent.");
      return;
    }

    if (form.champion === form.runnerUp) {
      setStatus("Pick a different final opponent.");
      return;
    }

    if (!isValidFinalPair(form.champion, form.runnerUp, teams)) {
      setStatus("Final must be PSG/Bayern vs Arsenal/Atlético.");
      return;
    }

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      ...form
    };

    setIsSaving(true);
    try {
      const response = await submitPrediction(form);
      setStatus(response.message || "Prediction saved.");
    } catch (error) {
      setStatus(`Saved locally. Backend note: ${error.message}`);
    } finally {
      setLocalPredictions((current) => [entry, ...current].slice(0, 40));
      setForm({
        name: "",
        champion: data.model.favorite,
        runnerUp: data.model.runnerUp,
        confidence: 72,
        reason: ""
      });
      setIsSaving(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <nav className="nav-shell" aria-label="Primary navigation">
          <a className="brand" href="#top">
            <span className="brand-mark"><Sparkles size={18} /></span>
            <span>UCL Predictor</span>
          </a>
          <div className="nav-links">
            <a href="#ucl">UCL</a>
            <a href="#pick">Pick</a>
            <a href="#live">Live</a>
            <a href="#model">Model</a>
            <a href="#teams">Teams</a>
            <a href="#predict">Predict</a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="glow-ring" aria-hidden="true" />
          <div className="glow-ring second" aria-hidden="true" />
          <div className="orbit" aria-hidden="true" />
          <div className="star-ring" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => <span key={index}>★</span>)}
          </div>
          <div className="hero-content">
            <p className="hero-pre"><Sparkles size={14} /> UEFA Champions League • Season 2025/26</p>
            <h1><span>Who lifts</span><strong>the trophy?</strong></h1>
            <p className="hero-copy">
              Semi-final match centre with live-score slots, final countdown, club photos, players to watch,
              strengths, weaknesses, and a fan prediction board.
            </p>
            <FinalCountdown parts={finalCountdown} />
            <div className="hero-actions">
              <a className="button primary" href="#pick"><Trophy size={18} /> Pick your champion</a>
              <a className="button secondary" href="#live"><Clock3 size={18} /> Match centre</a>
            </div>
          </div>
          {favorite && (
            <aside className="hero-panel" aria-label="Projected champion">
              <span className="panel-label">Projected champion</span>
              <img src={favorite.logo} alt={`${favorite.name} logo`} className="hero-logo" />
              <strong>{favorite.name}</strong>
              <span>{favorite.probability}% title probability</span>
            </aside>
          )}
        </section>

        <section className="hero-stat-strip" aria-label="Competition status">
          <InfoTile label="Current stage   " value={data.model.stage} />
          <InfoTile label="Final venue   " value="Puskás Aréna, Budapest" />
          <InfoTile label="Teams left   " value="4" />
          <InfoTile label="Fan votes   " value={fanVoteCount} />
        </section>

        {loadError && <p className="notice">Backend data could not load: {loadError}</p>}

        <UclIdentitySection />

        <section id="pick" className="section pick-section">
          <div className="section-heading centered">
            <p className="eyebrow">Pick your champion</p>
            <h2>Choose who survives the semi-finals</h2>
            <p>Select a club here and it fills your prediction form below. The cards use the model data, team stats, and crest assets from the app.</p>
          </div>
          <ChampionSelector teams={teams} selected={form.champion} onSelect={selectChampion} />
        </section>

        <section id="live" className="section">
          <div className="section-heading">
            <p className="eyebrow">Live scores</p>
            <h2>Match centre and countdown</h2>
            <p>Scores show here when the backend has live or final values. Until kickoff, each match shows a real-time countdown.</p>
          </div>
          <div className="match-grid">
            {matches.map((match) => (
              <MatchCard match={match} teamById={teamById} now={now} key={match.id} />
            ))}
          </div>
        </section>

        <section id="model" className="section">
          <div className="section-heading">
            <p className="eyebrow">Forecast</p>
            <h2>Champion probabilities</h2>
            <p>{data.model.summary}</p>
          </div>
          <div className="probability-grid">
            {teams.map((team) => <ProbabilityCard team={team} key={team.id} />)}
          </div>
        </section>

        <section className="section analysis-section">
          <div className="section-heading">
            <p className="eyebrow">Analysis</p>
            <h2>Bayern and PSG lead the model</h2>
            <p>
              Bayern get the narrow champion call, PSG remain the closest challenger, Arsenal carry the best defensive
              disruption case, and Atlético are the volatile outsider.
            </p>
          </div>
          <div className="analysis-grid">
            <AnalysisCard icon={<Crown />} title="Bayern case" text="Balanced attack, Kane scoring volume, Olise creation, and the head-to-head boost over PSG make Bayern the projected champion." />
            <AnalysisCard icon={<Activity />} title="PSG case" text="PSG's goal total, possession control, passing quality, and knockout attacking proof make them a near co-favorite." />
            <AnalysisCard icon={<ShieldCheck />} title="Arsenal case" text="Arsenal have the strongest defensive card left, with low concessions and a realistic path if the other semi-final is costly." />
            <AnalysisCard icon={<BarChart3 />} title="Atlético case" text="Atlético can score and recover the ball aggressively, but their goals-conceded profile pulls them behind the field." />
          </div>
        </section>

        <section id="teams" className="section">
          <div className="section-heading">
            <p className="eyebrow">Remaining teams</p>
            <h2>Photos, players, strengths and weaknesses</h2>
          </div>
          <div className="team-grid">
            {teams.map((team) => <TeamCard team={team} key={team.id} />)}
          </div>
        </section>

        <section id="predict" className="section prediction-section">
          <div className="section-heading">
            <p className="eyebrow">Your call</p>
            <h2>Submit your champion prediction</h2>
            <p>Your prediction is posted to Django when Sheets is configured. It is also shown immediately in this browser's live fan board.</p>
          </div>
          <div className="prediction-layout single">
            <form className="prediction-form" onSubmit={handleSubmit}>
              <div className="selected-pick">
                {selectedChampion && <img className={`selected-logo selected-logo-${selectedChampion.id}`} src={selectedChampion.logo} alt={`${selectedChampion.name} logo`} />}
                <span>Selected champion</span>
                <strong>{form.champion || "Choose a team"}</strong>
              </div>
              <div className="mini-picker" aria-label="Champion quick picker">
                {teams.map((team) => (
                  <button
                    className={`mini-pick ${form.champion === team.name ? "active" : ""}`}
                    type="button"
                    onClick={() => selectChampion(team)}
                    key={team.id}
                  >
                    <img className={`mini-logo mini-logo-${team.id}`} src={team.logo} alt="" />
                    <span>{team.name}</span>
                  </button>
                ))}
              </div>
              <label>
                Name
                <input name="name" value={form.name} onChange={updateField} maxLength={60} required />
              </label>
              <label>
                Final opponent
                <select name="runnerUp" value={form.runnerUp} onChange={updateField} required>
                  {runnerUpOptions.map((team) => <option key={team.id} value={team.name}>{team.name}</option>)}
                </select>
                <span className="field-hint">Final must be PSG/Bayern vs Arsenal/Atlético.</span>
              </label>
              <label>
                Confidence
                <input name="confidence" type="range" min="1" max="100" value={form.confidence} onChange={updateField} />
                <span className="confidence-value">{form.confidence}%</span>
              </label>
              <label>
                Short reason
                <textarea name="reason" value={form.reason} onChange={updateField} maxLength={280} rows={4} placeholder="Example: Bayern's attack and PSG tie experience make them my pick." />
              </label>
              <button className="button primary" type="submit" disabled={isSaving}>
                <Database size={18} /> {isSaving ? "Saving..." : "Cast prediction"}
              </button>
              {status && <p className="form-status">{status}</p>}
            </form>
          </div>
          <div className="fan-board">
            <VoteTally tally={voteTally} total={localPredictions.length} />
            <PredictionFeed predictions={localPredictions} teams={teams} now={now} />
          </div>
        </section>

        <section className="section source-section">
          <div className="section-heading">
            <p className="eyebrow">Sources</p>
            <h2>Data notes</h2>
          </div>
          <div className="source-list">
            {data.sources.map((source) => (
              <article className="source-item" key={source.url}>
                <h3><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h3>
                <p>{source.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section about-section">
          <div className="about-card">
            <div className="about-mark" aria-hidden="true">JJ</div>
            <div className="about-content">
              <p className="eyebrow">About me</p>
              <h2>Jerome Jayapal</h2>
              <p className="about-role">Data Scientist / AI Engineer</p>
              <p className="about-copy">
                I build data-driven and AI-powered applications that turn complex information into clear,
                interactive experiences. This Champions League predictor combines forecasting logic,
                live match context, and a clean fan prediction workflow.
              </p>
              <a className="button secondary compact" href="https://www.linkedin.com/in/jerome-jayapal-26209aa1/" target="_blank" rel="noreferrer">
                Connect on LinkedIn
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>Made by Jerome Jayapal. Copyright protected. Fan-made prediction project. Not affiliated with UEFA or any club.</p>
      </footer>
    </>
  );
}

function ChampionSelector({ teams, selected, onSelect }) {
  return (
    <div className="champion-selector">
      {teams.map((team) => (
        <ChampionPickCard team={team} selected={selected === team.name} onSelect={() => onSelect(team)} key={team.id} />
      ))}
    </div>
  );
}

function UclIdentitySection() {
  return (
    <section id="ucl" className="section ucl-identity-section">
      <div className="ucl-identity-card">
        <div className="ucl-brand-panel">
          <img src={UCL_LOGO_URL} alt="UEFA Champions League logo" className="ucl-logo" loading="lazy" />
          <div>
            <p className="eyebrow">Champions League theme</p>
            <h2>European nights under the lights</h2>
            <p>
              Starball branding, the trophy, and the anthem mood bring the page closer to a true Champions League
              match-night experience while keeping the project clearly fan-made.
            </p>
          </div>
        </div>
        <div className="ucl-trophy-panel">
          <img src={UCL_TROPHY_URL} alt="UEFA Champions League trophy" className="ucl-trophy" loading="lazy" />
          <div className="anthem-card">
            <span className="anthem-kicker">Anthem</span>
            <strong>Champions League</strong>
            <p>Official UEFA background on Tony Britten's anthem. Audio is linked, not downloaded or bundled.</p>
            <a className="button secondary compact" href={UCL_ANTHEM_URL} target="_blank" rel="noreferrer">
              Open anthem story
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChampionPickCard({ team, selected, onSelect }) {
  return (
    <button className={`champion-card ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <span className="champion-stripe" />
      {selected && <span className="champion-check"><Check size={16} /></span>}
      <span className="champion-card-top">
        <img className={`champion-logo champion-logo-${team.id}`} src={team.logo} alt={`${team.name} logo`} />
        <span>
          <strong>{team.name}</strong>
          <small>{team.country} • Rank {team.rank}</small>
        </span>
      </span>
      <span className="champion-card-stats">
        <span><strong>{team.stats.goals}</strong><small>Goals</small></span>
        <span><strong>{team.stats.conceded}</strong><small>Conceded</small></span>
        <span><strong>{team.probability}%</strong><small>Win prob.</small></span>
      </span>
      <span className="champion-reason">{team.note}</span>
      <span className="meter"><span style={{ width: `${team.probability}%` }} /></span>
    </button>
  );
}

function FinalCountdown({ parts }) {
  return (
    <div className="hero-countdown" aria-label="Countdown to Champions League final">
      <TimeBox label="Days" value={parts.days} />
      <TimeBox label="Hours" value={parts.hours} />
      <TimeBox label="Min" value={parts.minutes} />
      <TimeBox label="Sec" value={parts.seconds} />
    </div>
  );
}

function InfoTile({ label, value }) {
  return (
    <div>
      <span className="ticker-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MatchCard({ match, teamById, now }) {
  const home = teamById[match.homeTeamId];
  const away = teamById[match.awayTeamId];
  const kickoffTime = new Date(match.kickoff).getTime();
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const isPastKickoff = now >= kickoffTime;
  const status = hasScore ? match.status : isPastKickoff ? "awaiting live update" : "upcoming";

  return (
    <article className="match-card">
      <StadiumPhoto match={match} />
      <div className="match-meta">
        <span>{match.stage}</span>
        <strong>{formatKickoff(match.kickoff)}</strong>
      </div>
      <div className="score-row">
        <TeamScore team={home} fallbackName={match.homeTeam} score={match.homeScore} />
        <span className="score-divider">vs</span>
        <TeamScore team={away} fallbackName={match.awayTeam} score={match.awayScore} />
      </div>
      <div className="match-footer">
        <span>{match.venue}</span>
        <span className="status-pill">{status}</span>
      </div>
      {!hasScore && !isPastKickoff && <Countdown target={kickoffTime} now={now} />}
      {!hasScore && isPastKickoff && <p className="live-note">Kickoff window reached. Add a live-score API or update backend score fields to publish live numbers.</p>}
      <a className="button secondary compact" href={match.liveUrl} target="_blank" rel="noreferrer">
        <Activity size={16} /> UEFA live centre
      </a>
    </article>
  );
}

function StadiumPhoto({ match }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="stadium-photo">
      {match.stadiumImage && !failed ? (
        <img src={match.stadiumImage} alt={`${match.venue} stadium`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="stadium-fallback">
          <span>{match.venue}</span>
        </div>
      )}
      <span className="stadium-label">{match.venue}</span>
    </div>
  );
}

function TeamScore({ team, fallbackName, score }) {
  return (
    <div className="team-score">
      {team && <img className={`crest crest-${team.id}`} src={team.logo} alt={`${team.name} logo`} loading="lazy" />}
      <span>{team?.name || fallbackName}</span>
      <strong>{score ?? "–"}</strong>
    </div>
  );
}

function Countdown({ target, now }) {
  const parts = getCountdownParts(target, now);

  return (
    <div className="countdown" aria-label="Countdown to kickoff">
      <TimeBox label="Days" value={parts.days} />
      <TimeBox label="Hours" value={parts.hours} />
      <TimeBox label="Min" value={parts.minutes} />
      <TimeBox label="Sec" value={parts.seconds} />
    </div>
  );
}

function TimeBox({ label, value }) {
  return (
    <div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProbabilityCard({ team }) {
  return (
    <article className="probability-card">
      <div className="probability-top">
        <img className={`crest crest-${team.id}`} src={team.logo} alt={`${team.name} logo`} loading="lazy" />
        <div>
          <strong>{team.name}</strong>
          <span>{team.country} • Rank {team.rank}</span>
        </div>
      </div>
      <div className="probability-value">{team.probability}%</div>
      <div className="meter" aria-label={`${team.name} title probability ${team.probability}%`}>
        <span style={{ width: `${team.probability}%` }} />
      </div>
    </article>
  );
}

function AnalysisCard({ icon, title, text }) {
  return (
    <article className="analysis-card">
      <div className="card-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function TeamCard({ team }) {
  return (
    <article className="team-card detailed">
      <TeamPhoto team={team} />
      <header>
        <img className={`crest crest-${team.id}`} src={team.logo} alt={`${team.name} logo`} loading="lazy" />
        <div>
          <h3>{team.name}</h3>
          <span>{team.country}</span>
        </div>
      </header>
      <div className="stat-grid">
        <Stat label="Goals" value={team.stats.goals} />
        <Stat label="Conceded" value={team.stats.conceded} />
        <Stat label="Possession" value={team.stats.possession} />
        <Stat label="Passing" value={team.stats.passing} />
        <Stat label="Clean sheets" value={team.stats.cleanSheets} />
        <Stat label="Recoveries" value={team.stats.recoveries} />
      </div>
      {team.manager && <ManagerPanel manager={team.manager} />}
      {team.recentForm && <RecentForm form={team.recentForm} />}
      <p>{team.note}</p>
      <div className="watch-list">
        <h4>Players to watch</h4>
        {team.playersToWatch.map((player) => (
          <PlayerWatchCard player={player} key={player.name} />
        ))}
      </div>
      <div className="team-lists">
        <MiniList title="Strengths" icon={<ShieldCheck size={16} />} items={team.strengths} />
        <MiniList title="Weaknesses" icon={<ShieldAlert size={16} />} items={team.weaknesses} />
      </div>
    </article>
  );
}

function PlayerWatchCard({ player }) {
  const [failed, setFailed] = useState(false);
  const initials = player.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="player-watch-card">
      <div className="player-portrait">
        {player.photo && !failed ? (
          <img src={player.photo} alt={player.name} loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div>
        <strong>{player.name}</strong>
        <span>{player.role}</span>
      </div>
    </div>
  );
}

function ManagerPanel({ manager }) {
  return (
    <div className="manager-panel">
      <span className="manager-label">{manager.title}</span>
      <strong>{manager.name}</strong>
      <small>{manager.joined}</small>
      <p>{manager.style}</p>
    </div>
  );
}

function RecentForm({ form }) {
  return (
    <div className="recent-form-grid">
      <FormColumn title="Champions League last 5" items={form.championsLeague} />
      <FormColumn title="League last 5" items={form.league} />
    </div>
  );
}

function FormColumn({ title, items = [] }) {
  return (
    <div className="form-column">
      <h4>{title}</h4>
      <ol>
        {items.map((item) => (
          <li key={item}>
            <span className={`result-dot result-${item[0]?.toLowerCase()}`}>{item[0]}</span>
            <span>{item.slice(2)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TeamPhoto({ team }) {
  const [failed, setFailed] = useState(false);

  if (failed || !team.photo) {
    return (
      <div className="team-photo fallback">
        <img src={team.logo} alt={`${team.name} logo`} loading="lazy" />
        {team.photoPage && <a href={team.photoPage} target="_blank" rel="noreferrer">Open club photos</a>}
      </div>
    );
  }

  return (
    <div className="team-photo">
      <img src={team.photo} alt={`${team.name} squad`} loading="lazy" onError={() => setFailed(true)} />
      {team.photoPage && <a href={team.photoPage} target="_blank" rel="noreferrer">Official photo source</a>}
    </div>
  );
}

function MiniList({ title, icon, items }) {
  return (
    <div className="mini-list">
      <h4>{icon}{title}</h4>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function VoteTally({ tally, total }) {
  const denominator = Math.max(total, 1);

  return (
    <article className="vote-card">
      <div className="vote-card-head">
        <h3>Live fan vote tally</h3>
        <span>{total} local vote{total === 1 ? "" : "s"}</span>
      </div>
      {tally.map(({ team, count }) => {
        const percent = Math.round((count / denominator) * 100);
        return (
          <div className="tally-row" key={team.id}>
            <span className="tally-team">
              <img className={`tally-logo tally-logo-${team.id}`} src={team.logo} alt="" />
              <strong>{team.name}</strong>
            </span>
            <span className="tally-bar"><span style={{ width: `${percent}%` }} /></span>
            <span className="tally-percent">{percent}%</span>
            <span className="tally-count">{count}</span>
          </div>
        );
      })}
    </article>
  );
}

function PredictionFeed({ predictions, teams, now }) {
  const teamLookup = Object.fromEntries(teams.map((team) => [team.name, team]));

  return (
    <article className="vote-card">
      <div className="vote-card-head">
        <h3>Recent predictions</h3>
        <span>Browser feed</span>
      </div>
      {!predictions.length && <p className="empty-feed">No predictions yet. Make the first call.</p>}
      <div className="prediction-feed">
        {predictions.slice(0, 8).map((prediction) => {
          const team = teamLookup[prediction.champion];
          return (
            <div className="prediction-entry" key={prediction.id}>
              <span className="feed-avatar">{prediction.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{prediction.name}</strong>
                <span>
                  {team && <img className={`feed-logo feed-logo-${team.id}`} src={team.logo} alt="" />}
                  {prediction.champion} • {prediction.confidence}% confident
                </span>
                {prediction.reason && <p>{prediction.reason}</p>}
                <small>{formatRelativeTime(prediction.timestamp, now)}</small>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getCountdownParts(target, now) {
  const remaining = Math.max(target - now, 0);
  const totalSeconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function formatKickoff(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelativeTime(timestamp, now) {
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getFinalOpponentOptions(championName, teams) {
  const champion = teams.find((team) => team.name === championName);
  const championSide = getFinalSide(champion?.id);

  if (championSide === "a") return teams.filter((team) => FINAL_SIDE_B.has(team.id));
  if (championSide === "b") return teams.filter((team) => FINAL_SIDE_A.has(team.id));
  return teams;
}

function isValidFinalPair(championName, runnerUpName, teams) {
  const champion = teams.find((team) => team.name === championName);
  const runnerUp = teams.find((team) => team.name === runnerUpName);
  const championSide = getFinalSide(champion?.id);
  const runnerUpSide = getFinalSide(runnerUp?.id);

  return Boolean(championSide && runnerUpSide && championSide !== runnerUpSide);
}

function getFinalSide(teamId) {
  if (FINAL_SIDE_A.has(teamId)) return "a";
  if (FINAL_SIDE_B.has(teamId)) return "b";
  return "";
}

function readLocalPredictions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PREDICTIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

export default App;
