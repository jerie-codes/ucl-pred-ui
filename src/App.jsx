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
const LOCAL_WDW_VOTES_KEY = "ucl-predictor-wdw-votes-v1";
const FINAL_SIDE_A = new Set(["psg", "bayern"]);
const FINAL_SIDE_B = new Set(["arsenal", "atleti"]);

const fallbackData = {
  model: {
    verifiedDate: "2026-04-27",
    stage: "Semi-finals",
    final: "30 May 2026 • Puskás Aréna, Budapest",
    favorite: "Paris Saint-Germain",
    runnerUp: "Arsenal",
    summary:
      "PSG and Bayern are intentionally weighted as the two strongest contenders. PSG narrowly lead Bayern because they combine the best remaining goal output with possession control, recoveries, and stronger knockout attacking form."
  },
  matches: [],
  teams: [],
  leaders: {
    mvp: {
      name: "Julián Alvarez",
      team: "Atlético de Madrid",
      role: "Season MVP",
      photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Juli%C3%A1n%20%C3%81lvarez%20%28footballer%29%202023.jpg",
      value: "9 goals, 4 assists, 13 goal involvements",
      note: "Among the remaining players checked, Alvarez owns the strongest combined UCL goal-and-assist profile while also leading Atlético's press and transition threat."
    },
    topScorers: [],
    topAssists: [],
    topGoalAssists: []
  },
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
    champion: "Paris Saint-Germain",
    runnerUp: "Arsenal",
    confidence: 72,
    reason: ""
  });
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [localPredictions, setLocalPredictions] = useState(() => readLocalPredictions());
  const [wdwVotes, setWdwVotes] = useState(() => readWdwVotes());

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

  useEffect(() => {
    localStorage.setItem(LOCAL_WDW_VOTES_KEY, JSON.stringify(wdwVotes));
  }, [wdwVotes]);

  const teams = data.teams || [];
  const matches = data.matches || [];
  const leaders = data.leaders || fallbackData.leaders;
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

  function addWdwVote(matchId, outcome) {
    setWdwVotes((current) => {
      const matchVotes = current[matchId] || { home: 0, draw: 0, away: 0 };
      return {
        ...current,
        [matchId]: {
          ...matchVotes,
          [outcome]: matchVotes[outcome] + 1
        }
      };
    });
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
            <Trophy className="brand-trophy" size={19} aria-hidden="true" />
            <span>UCL Predictor</span>
          </a>
          <div className="nav-links">
            <a href="#live">Live</a>
            <a href="#model">Model</a>
            <a href="#leaders">Leaders</a>
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
              <a className="button primary" href="#predict"><Trophy size={18} /> Make prediction</a>
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
          <InfoTile label="Current stage" value={data.model.stage} />
          <InfoTile label="Final date" value="30 May 2026" />
          <InfoTile label="Final venue" value="Puskás Aréna, Budapest" />
          <InfoTile label="Fan votes" value={fanVoteCount} />
        </section>

        {loadError && <p className="notice">Backend data could not load: {loadError}</p>}

        <section id="live" className="section">
          <div className="section-heading">
            <p className="eyebrow">Live scores</p>
            <h2>Match centre and countdown</h2>
            <p>Scores show here when the backend has live or final values. Until kickoff, each match shows a real-time countdown.</p>
          </div>
          <div className="match-grid">
            {matches.map((match) => (
              <MatchCard
                match={match}
                teamById={teamById}
                now={now}
                wdwVotes={wdwVotes[match.id]}
                onWdwVote={addWdwVote}
                key={match.id}
              />
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
            <h2>PSG and Bayern lead the model</h2>
            <p>
              PSG get the narrow champion call, Bayern remain the closest challenger, Arsenal carry the best defensive
              disruption case, and Atlético are the volatile outsider.
            </p>
          </div>
          <div className="analysis-grid">
            <AnalysisCard icon={<Crown />} title="PSG case" text="PSG's goal total, possession control, high recoveries, and knockout attacking proof make them the projected champion." />
            <AnalysisCard icon={<Activity />} title="Bayern case" text="Kane's scoring volume, Olise creation, and balanced attacking structure keep Bayern close enough to swing the tie." />
            <AnalysisCard icon={<ShieldCheck />} title="Arsenal case" text="Arsenal have the strongest defensive card left, with low concessions and a realistic path if the other semi-final is costly." />
            <AnalysisCard icon={<BarChart3 />} title="Atlético case" text="Atlético can score and recover the ball aggressively, but their goals-conceded profile pulls them behind the field." />
          </div>
        </section>

        <section id="leaders" className="section leaders-section">
          <div className="section-heading">
            <p className="eyebrow">Season leaders</p>
            <h2>MVP, scorers, assists and G/A</h2>
            <p>Key individual leaders from the remaining Champions League field and the player profile driving the model.</p>
          </div>
          <LeadersBoard leaders={leaders} />
        </section>

        <section id="predict" className="section prediction-section">
          <div className="section-heading">
            <p className="eyebrow">Your call</p>
            <h2>Pick and submit your champion</h2>
            <p>Select the club you believe will lift the trophy, choose the valid final opponent, and cast your prediction.</p>
          </div>
          <ChampionSelector teams={teams} selected={form.champion} onSelect={selectChampion} />
          <div className="prediction-layout single">
            <form className="prediction-form" onSubmit={handleSubmit}>
              <div className="selected-pick">
                {selectedChampion && <img className={`selected-logo selected-logo-${selectedChampion.id}`} src={selectedChampion.logo} alt={`${selectedChampion.name} logo`} />}
                <span>Selected champion</span>
                <strong>{form.champion || "Choose a team"}</strong>
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

        <section id="teams" className="section">
          <div className="section-heading">
            <p className="eyebrow">Remaining teams</p>
            <h2>Players, managers, strengths and weaknesses</h2>
          </div>
          <div className="team-grid">
            {teams.map((team) => <TeamCard team={team} key={team.id} />)}
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
              <div className="contact-actions">
                <a className="button secondary compact" href="https://www.linkedin.com/in/jerome-jayapal-26209aa1/" target="_blank" rel="noreferrer">
                  Connect on LinkedIn
                </a>
                <a className="button secondary compact" href="mailto:jeriedev@gmail.com">
                  jeriedev@gmail.com
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p><span className="copyright-mark">©</span> Jerome Jayapal. All rights reserved. Fan-made prediction project. Not affiliated with UEFA or any club.</p>
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

function MatchCard({ match, teamById, now, wdwVotes, onWdwVote }) {
  const home = teamById[match.homeTeamId];
  const away = teamById[match.awayTeamId];
  const kickoffTime = new Date(match.kickoff).getTime();
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const isPastKickoff = now >= kickoffTime;
  const status = hasScore ? match.status : isPastKickoff ? "awaiting live update" : "upcoming";
  const legPrediction = home && away ? buildLegPrediction(home, away) : null;

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
      {legPrediction && <ModelScoreline prediction={legPrediction} home={home} away={away} />}
      {home && away && (
        <UserWdwVote
          match={match}
          home={home}
          away={away}
          votes={wdwVotes}
          onVote={onWdwVote}
        />
      )}
      <div className="match-footer">
        <span>{match.venue}</span>
        <span className="status-pill">{status}</span>
      </div>
      {legPrediction && <LegPredictionPanel prediction={legPrediction} />}
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

function LegPredictionPanel({ prediction }) {
  return (
    <div className="leg-prediction">
      <div className="leg-prediction-top">
        <span>Leg prediction</span>
        <strong>{prediction.winner.name}</strong>
        <em>{prediction.edge}% edge</em>
      </div>
      <div className="leg-meter" aria-label={`${prediction.winner.name} projected edge ${prediction.edge}%`}>
        <span style={{ width: `${prediction.edge}%` }} />
      </div>
      <div className="factor-grid">
        {prediction.factors.map((factor) => (
          <div className="factor-chip" key={factor.label}>
            <span>{factor.label}</span>
            <strong>{factor.value}</strong>
            <small>{factor.note}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelScoreline({ prediction, home, away }) {
  return (
    <div className="model-scoreline">
      <div>
        <span>Stats-based score prediction</span>
        <strong>{prediction.scoreline}</strong>
        <small>xG: {home.name} {prediction.expected.home.toFixed(1)} - {prediction.expected.away.toFixed(1)} {away.name}</small>
      </div>
      <WinDrawWin home={home} away={away} probabilities={prediction.probabilities} />
    </div>
  );
}

function WinDrawWin({ home, away, probabilities, active, onSelect }) {
  const items = [
    { key: "home", label: home.name, value: probabilities.home },
    { key: "draw", label: "Draw", value: probabilities.draw },
    { key: "away", label: away.name, value: probabilities.away }
  ];

  return (
    <div className="wdw-row" aria-label="Win draw win probability">
      {items.map((item) => (
        <button
          className={`wdw-chip ${active === item.key ? "active" : ""} ${onSelect ? "clickable" : ""}`}
          type="button"
          onClick={onSelect ? () => onSelect(item.key) : undefined}
          key={item.key}
        >
          <span>{item.label}</span>
          <strong>{item.value}%</strong>
        </button>
      ))}
    </div>
  );
}

function UserWdwVote({ match, home, away, votes, onVote }) {
  const counts = votes || { home: 0, draw: 0, away: 0 };
  const total = counts.home + counts.draw + counts.away;
  const percentages = total
    ? {
        home: Math.round((counts.home / total) * 100),
        draw: Math.round((counts.draw / total) * 100),
        away: 100 - Math.round((counts.home / total) * 100) - Math.round((counts.draw / total) * 100)
      }
    : { home: 0, draw: 0, away: 0 };

  return (
    <div className="score-predictor">
      <div className="score-predictor-head">
        <span>Fan Win-Draw-Win</span>
        <strong>{total} vote{total === 1 ? "" : "s"}</strong>
      </div>
      <div className="user-wdw">
        <span>Click to add a vote</span>
        <WinDrawWin
          home={home}
          away={away}
          onSelect={(outcome) => onVote(match.id, outcome)}
          probabilities={percentages}
        />
      </div>
      <div className="vote-count-row">
        <span>{home.name}: {counts.home}</span>
        <span>Draw: {counts.draw}</span>
        <span>{away.name}: {counts.away}</span>
      </div>
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

function LeadersBoard({ leaders }) {
  return (
    <div className="leaders-grid">
      <article className="mvp-card">
        {leaders.mvp.photo && <img className="mvp-photo" src={leaders.mvp.photo} alt={leaders.mvp.name} loading="lazy" />}
        <span className="leader-kicker">{leaders.mvp.role}</span>
        <h3>{leaders.mvp.name}</h3>
        <strong>{leaders.mvp.team}</strong>
        <p>{leaders.mvp.value}</p>
        <small>{leaders.mvp.note}</small>
      </article>
      <LeaderList title="Top scorers" metric="Goals" rows={leaders.topScorers} />
      <LeaderList title="Top assists" metric="Assists" rows={leaders.topAssists} />
      <LeaderList title="Top G/A" metric="G/A" rows={leaders.topGoalAssists} />
    </div>
  );
}

function LeaderList({ title, metric, rows = [] }) {
  return (
    <article className="leader-list">
      <div className="leader-list-head">
        <h3>{title}</h3>
        <span>{metric}</span>
      </div>
      <div className="leader-rows">
        {rows.map((row) => (
          <div className="leader-row" key={`${title}-${row.rank}-${row.name}`}>
            <span className="leader-rank">{row.rank}</span>
            <span>
              <strong>{row.name}</strong>
              <small>{row.team}</small>
            </span>
            <em>{row.value}</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function TeamCard({ team }) {
  return (
    <article className="team-card detailed">
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
      <FormColumn title="Domestic league last 5" items={form.league} />
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

function buildLegPrediction(home, away) {
  const homeRating = buildTeamLegScore(home, true);
  const awayRating = buildTeamLegScore(away, false);
  const expected = buildExpectedGoals(home, away, homeRating, awayRating);
  const probabilities = buildWinDrawWin(expected.home, expected.away);
  const winner = probabilities.home >= probabilities.away ? home : away;
  const loser = winner.id === home.id ? away : home;
  const edge = Math.max(probabilities.home, probabilities.away);

  return {
    winner,
    edge,
    expected,
    probabilities,
    scoreline: buildModelScoreline(home, away, expected),
    factors: buildLegFactors(winner, loser, winner.id === home.id)
  };
}

function buildExpectedGoals(home, away, homeRating, awayRating) {
  const homeAttack = Number(home.stats.goals || 0) / Math.max(Number(away.stats.conceded || 1), 1);
  const awayAttack = Number(away.stats.goals || 0) / Math.max(Number(home.stats.conceded || 1), 1);
  const homeControl = (parsePercent(home.stats.possession) + parsePercent(home.stats.passing)) / 190;
  const awayControl = (parsePercent(away.stats.possession) + parsePercent(away.stats.passing)) / 190;
  const ratingGap = (homeRating - awayRating) / 45;

  return {
    home: clampNumber(1.05 + homeAttack * 0.26 + homeControl * 0.34 + ratingGap * 0.22, 0.4, 3.6),
    away: clampNumber(0.9 + awayAttack * 0.25 + awayControl * 0.3 - ratingGap * 0.12, 0.3, 3.4)
  };
}

function buildWinDrawWin(homeXg, awayXg) {
  const diff = homeXg - awayXg;
  const draw = clamp(Math.round(27 - Math.abs(diff) * 7), 16, 31);
  const remaining = 100 - draw;
  const homeShare = 1 / (1 + Math.exp(-diff * 1.45));
  const home = clamp(Math.round(remaining * homeShare), 10, remaining - 10);
  const away = 100 - draw - home;

  return { home, draw, away };
}

function buildModelScoreline(home, away, expected) {
  const homeGoals = clamp(Math.round(expected.home), 0, 5);
  const awayGoals = clamp(Math.round(expected.away), 0, 5);

  if (homeGoals === awayGoals && Math.abs(expected.home - expected.away) > 0.28) {
    return expected.home > expected.away
      ? `${home.name} ${homeGoals + 1}-${awayGoals} ${away.name}`
      : `${home.name} ${homeGoals}-${awayGoals + 1} ${away.name}`;
  }

  return `${home.name} ${homeGoals}-${awayGoals} ${away.name}`;
}

function buildTeamLegScore(team, isHome) {
  return (
    team.probability * 1.4 +
    Number(team.stats.goals || 0) * 0.75 -
    Number(team.stats.conceded || 0) * 0.42 +
    Number(team.stats.cleanSheets || 0) * 1.2 +
    Number(team.stats.recoveries || 0) * 0.018 +
    parsePercent(team.stats.possession) * 0.18 +
    parsePercent(team.stats.passing) * 0.12 +
    (isHome ? 4 : 0)
  );
}

function buildLegFactors(winner, loser, isHomeWinner) {
  const goalGap = Number(winner.stats.goals || 0) - Number(loser.stats.goals || 0);
  const concededGap = Number(loser.stats.conceded || 0) - Number(winner.stats.conceded || 0);
  const possessionGap = parsePercent(winner.stats.possession) - parsePercent(loser.stats.possession);
  const recoveryGap = Number(winner.stats.recoveries || 0) - Number(loser.stats.recoveries || 0);

  return [
    {
      label: "Venue",
      value: isHomeWinner ? "Home edge" : "Away edge",
      note: isHomeWinner ? `${winner.name} get crowd and travel advantage.` : `${winner.name} rate higher even away from home.`
    },
    {
      label: "Attack",
      value: `${winner.stats.goals} goals`,
      note: goalGap >= 0 ? `${Math.abs(goalGap)} more than ${loser.name}.` : `Lower total, but stronger matchup balance.`
    },
    {
      label: "Defence",
      value: `${winner.stats.conceded} conceded`,
      note: concededGap >= 0 ? `${concededGap} fewer conceded than ${loser.name}.` : `Risk factor: ${loser.name} concede less.`
    },
    {
      label: "Control",
      value: winner.stats.possession,
      note: possessionGap >= 0 ? `${possessionGap.toFixed(1)}% possession edge.` : `${loser.name} may control more of the ball.`
    },
    {
      label: "Pressure",
      value: `${winner.stats.recoveries} recoveries`,
      note: recoveryGap >= 0 ? `${recoveryGap} recovery advantage.` : `${loser.name} recover more balls.`
    },
    {
      label: "Model",
      value: `${winner.probability}% title rate`,
      note: `Higher overall tournament projection than ${loser.name}.`
    }
  ];
}

function parsePercent(value) {
  return Number(String(value || "0").replace("%", "")) || 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function readWdwVotes() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_WDW_VOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

export default App;
