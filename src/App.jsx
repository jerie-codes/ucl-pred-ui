import {
  Activity,
  BarChart3,
  Check,
  Clock3,
  Crown,
  Database,
  Eye,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { fetchForecast, fetchMatchDetail, fetchMatchVotes, fetchPredictions, submitMatchVote, submitPrediction } from "./api";

const FINAL_KICKOFF = "2026-05-30T18:00:00+02:00";
const LOCAL_PREDICTIONS_KEY = "ucl-predictor-local-predictions-v2";
const EMPTY_VOTE_COUNTS = { home: 0, draw: 0, away: 0 };
const FINAL_SIDE_A = new Set(["psg", "bayern"]);
const FINAL_SIDE_B = new Set(["arsenal", "atleti"]);

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
  const [matchVotes, setMatchVotes] = useState({});
  const [sharedPredictions, setSharedPredictions] = useState({ count: 0, tally: {}, recent: [] });
  const [hasInitializedForm, setHasInitializedForm] = useState(false);
  const teams = data.teams || [];
  const matches = data.matches || [];
  const hasLiveMatch = matches.some((match) => isLiveStatus(match.status));

  useEffect(() => {
    let isActive = true;

    async function loadForecast() {
      try {
        const forecast = await fetchForecast();
        if (!isActive) return;

        setData(forecast);
        setLoadError("");

        if (!hasInitializedForm && forecast.teams?.length) {
          setForm((current) => ({
            ...current,
            champion: forecast.model.favorite,
            runnerUp: forecast.model.runnerUp
          }));
          setHasInitializedForm(true);
        }

        try {
          const voteData = await fetchMatchVotes();
          if (!isActive) return;
          setMatchVotes(voteData.voteCounts || {});
        } catch {}

        try {
          const predictionData = await fetchPredictions();
          if (!isActive) return;
          setSharedPredictions({
            count: predictionData.count || 0,
            tally: predictionData.tally || {},
            recent: predictionData.recent || []
          });
        } catch {}
      } catch (error) {
        if (isActive) {
          setLoadError(error.message);
        }
      }
    }

    loadForecast();
    const poller = window.setInterval(loadForecast, hasLiveMatch ? 10000 : 30000);

    return () => {
      isActive = false;
      window.clearInterval(poller);
    };
  }, [hasInitializedForm, hasLiveMatch]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_PREDICTIONS_KEY, JSON.stringify(localPredictions));
  }, [localPredictions]);
  const teamById = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team])), [teams]);
  const favorite = useMemo(() => teams.find((team) => team.name === data.model.favorite) || teams[0], [teams, data.model.favorite]);
  const selectedChampion = teams.find((team) => team.name === form.champion);
  const runnerUpOptions = useMemo(() => getFinalOpponentOptions(form.champion, teams), [form.champion, teams]);
  const finalCountdown = getCountdownParts(new Date(FINAL_KICKOFF).getTime(), now);
  const fanVoteCount = sharedPredictions.count || data.predictionCount || localPredictions.length;

  const voteTally = useMemo(() => {
    const counts = Object.fromEntries(teams.map((team) => [team.name, sharedPredictions.tally[team.name] || 0]));
    return teams
      .map((team) => ({ team, count: counts[team.name] || 0 }))
      .sort((a, b) => b.count - a.count || b.team.probability - a.team.probability);
  }, [teams, sharedPredictions]);

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
      setSharedPredictions({
        count: response.count || 0,
        tally: response.tally || {},
        recent: response.recent || []
      });
    } catch (error) {
      setStatus(`Saved locally. Backend note: ${error.message}`);
      setLocalPredictions((current) => [entry, ...current].slice(0, 40));
    } finally {
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

  async function handleMatchVote(matchId, outcome) {
    const response = await submitMatchVote({ matchId, outcome });
    setMatchVotes((current) => ({
      ...current,
      [matchId]: response.voteCounts || EMPTY_VOTE_COUNTS
    }));
    return response.voteCounts || EMPTY_VOTE_COUNTS;
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
            <a href="#predict">Pick</a>
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
              <a className="button primary" href="#predict"><Trophy size={18} /> Make your call</a>
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

        {false && (
        <section className="section leaders-section">
          <div className="section-heading">
            <p className="eyebrow">Leaders</p>
            <h2>Top performers — goals, assists, MVP</h2>
            <p>Season leaders among the remaining squads: top scorers, assist makers, and an MVP candidate.</p>
          </div>
          <div className="leaders-grid">
            {data.leaders && (
              <>
                <article className="mvp-card">
                  <span className="leader-kicker">Most valuable player</span>
                  <div className="mvp-photo">
                    <img src={data.leaders.mvp.photo} alt={data.leaders.mvp.name} />
                  </div>
                  <h3>{data.leaders.mvp.name}</h3>
                  <strong>{data.leaders.mvp.team}</strong>
                  <p className="muted">{data.leaders.mvp.role}</p>
                  <p>{data.leaders.mvp.value}</p>
                  <p className="muted small">{data.leaders.mvp.note}</p>
                </article>

                <article className="leader-list">
                  <div className="leader-list-head">
                    <h3>Top scorers</h3>
                    <span>Goals</span>
                  </div>
                  <div className="leader-rows">
                    {data.leaders.topScorers.map((s) => (
                      <li key={s.rank}>{s.rank}. {s.name} — {s.team} ({s.value})</li>
                    ))}
                  </div>
                </article>

                <article className="leader-list">
                  <div className="leader-list-head">
                    <h3>Top assists</h3>
                    <span>Assists</span>
                  </div>
                  <div className="leader-rows">
                    {data.leaders.topAssists.map((s) => (
                      <li key={s.rank}>{s.rank}. {s.name} — {s.team} ({s.value})</li>
                    ))}
                  </div>
                </article>

                <article className="leader-list">
                  <div className="leader-list-head">
                    <h3>Goals + assists</h3>
                    <span>Goal involvements</span>
                  </div>
                  <div className="leader-rows">
                    {data.leaders.topGoalAssists.map((s) => (
                      <li key={s.rank}>{s.rank}. {s.name} — {s.team} ({s.value})</li>
                    ))}
                  </div>
                </article>
              </>
            )}
          </div>
        </section>
        )}

        <section className="hero-stat-strip" aria-label="Competition status">
          <InfoTile label="Current stage   " value={data.model.stage} />
          <InfoTile label="Final venue   " value="Puskás Aréna, Budapest" />
          <InfoTile label="Teams left   " value="4" />
          <InfoTile label="Fan votes   " value={fanVoteCount} />
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
                voteCounts={matchVotes[match.id] || EMPTY_VOTE_COUNTS}
                onVote={handleMatchVote}
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

        <LeadersSection leaders={data.leaders} />

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
            <h2>Make your call</h2>
            <p>Pick your champion, set a final opponent, and send your prediction. Your vote is posted to Django when Sheets is configured and also appears immediately in this browser.</p>
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
            <VoteTally tally={voteTally} total={fanVoteCount} />
            <PredictionFeed predictions={sharedPredictions.recent.length ? sharedPredictions.recent : localPredictions} teams={teams} now={now} />
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

function MatchCard({ match, teamById, now, voteCounts, onVote }) {
  const home = teamById[match.homeTeamId];
  const away = teamById[match.awayTeamId];
  const kickoffTime = new Date(match.kickoff).getTime();
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const isPastKickoff = now >= kickoffTime;
  const status = hasScore ? match.status : isPastKickoff ? "awaiting live update" : "upcoming";
  const isLive = isLiveStatus(match.status);
  const [selectedOutcome, setSelectedOutcome] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [matchDetail, setMatchDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isVoteSaving, setIsVoteSaving] = useState(false);
  const [voteError, setVoteError] = useState("");

  useEffect(() => {
    if (!showDetails) return undefined;

    let isActive = true;

    async function loadDetail() {
      try {
        setIsDetailLoading(true);
        const detail = await fetchMatchDetail(match.id);
        if (!isActive) return;
        setMatchDetail(detail);
        setDetailError("");
      } catch (error) {
        if (isActive) {
          setDetailError(error.message);
        }
      } finally {
        if (isActive) {
          setIsDetailLoading(false);
        }
      }
    }

    loadDetail();
    const poller = window.setInterval(loadDetail, isLiveStatus(matchDetail?.status || match.status) ? 10000 : 30000);

    return () => {
      isActive = false;
      window.clearInterval(poller);
    };
  }, [showDetails, match.id]);

  async function handleOutcomeVote(outcome) {
    if (selectedOutcome || isVoteSaving) return;

    setIsVoteSaving(true);
    setVoteError("");
    try {
      await onVote(match.id, outcome);
      setSelectedOutcome(outcome);
    } catch (error) {
      setVoteError(error.message || "Could not save your vote.");
    } finally {
      setIsVoteSaving(false);
    }
  }

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
        <span className={`status-pill ${isLive ? "live" : ""}`}>
          {isLive ? <><Activity size={14} /> Live</> : formatMatchStatus(status)}
        </span>
      </div>
      <WinDrawWinPoll
        homeName={home?.name || match.homeTeam}
        awayName={away?.name || match.awayTeam}
        selectedOutcome={selectedOutcome}
        voteCounts={voteCounts}
        onVote={handleOutcomeVote}
        isVoteSaving={isVoteSaving}
      />
      {voteError && <p className="live-note">{voteError}</p>}
      {!hasScore && !isPastKickoff && <Countdown target={kickoffTime} now={now} />}
      {!hasScore && isPastKickoff && <p className="live-note">Kickoff window reached. Live score polling is running, and this card refreshes regularly while the match is live.</p>}
      <button className="button secondary compact details-toggle" type="button" onClick={() => setShowDetails((current) => !current)}>
        {showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
        {showDetails ? "Hide match details" : "Show match details"}
      </button>
      {showDetails && (
        <MatchDetailPanel
          detail={matchDetail}
          isLoading={isDetailLoading}
          error={detailError}
          homeName={home?.name || match.homeTeam}
          awayName={away?.name || match.awayTeam}
        />
      )}
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

function LeadersSection({ leaders }) {
  if (!leaders) return null;

  return (
    <section id="leaders" className="section leaders-section">
      <div className="section-heading">
        <p className="eyebrow">Leaders</p>
        <h2>Top performers â€” goals, assists, MVP</h2>
        <p>Season leaders among the remaining squads: top scorers, assist makers, and an MVP candidate.</p>
      </div>
      <div className="leaders-grid">
        <article className="mvp-card">
          <span className="leader-kicker">Most valuable player</span>
          <div className="mvp-photo">
            <img src={leaders.mvp.photo} alt={leaders.mvp.name} />
          </div>
          <h3>{leaders.mvp.name}</h3>
          <strong>{leaders.mvp.team}</strong>
          <p className="muted">{leaders.mvp.role}</p>
          <p>{leaders.mvp.value}</p>
          <p className="muted small">{leaders.mvp.note}</p>
        </article>

        <LeaderList title="Top scorers" label="Goals" items={leaders.topScorers} />
        <LeaderList title="Top assists" label="Assists" items={leaders.topAssists} />
        <LeaderList title="Goals + assists" label="Goal involvements" items={leaders.topGoalAssists} />
      </div>
    </section>
  );
}

function LeaderList({ title, label, items }) {
  const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 1);

  return (
    <article className="leader-list">
      <div className="leader-list-head">
        <h3>{title}</h3>
        <span>{label}</span>
      </div>
      <div className="leader-rows">
        {items.map((item) => (
          <LeaderRow
            key={`${title}-${item.rank}-${item.name}`}
            rank={item.rank}
            name={item.name}
            team={item.team}
            value={item.value}
            fill={Math.max((Number(item.value) || 0) / maxValue, 0.12)}
          />
        ))}
      </div>
    </article>
  );
}

function LeaderRow({ rank, name, team, value, fill }) {
  return (
    <div className="leader-row">
      <span className="leader-rank">{rank}</span>
      <span className="leader-player">
        <strong>{name}</strong>
        <small>{team}</small>
      </span>
      <span className="leader-value-block">
        <em>{value}</em>
        <span className="leader-value-meter"><span style={{ width: `${Math.round(fill * 100)}%` }} /></span>
      </span>
    </div>
  );
}

function WinDrawWinPoll({ homeName, awayName, selectedOutcome, voteCounts, onVote, isVoteSaving }) {
  const totalVotes = voteCounts.home + voteCounts.draw + voteCounts.away;
  const options = [
    { key: "home", label: `${homeName} win`, count: voteCounts.home },
    { key: "draw", label: "Draw", count: voteCounts.draw },
    { key: "away", label: `${awayName} win`, count: voteCounts.away }
  ];

  return (
    <div className="score-predictor">
      <div className="score-predictor-head">
        <span>Win-draw-win</span>
        <strong>
          {isVoteSaving
            ? "Saving vote..."
            : totalVotes
              ? `${totalVotes} saved vote${totalVotes === 1 ? "" : "s"}`
              : "One vote per refresh"}
        </strong>
      </div>
      <div className="wdw-row" aria-label="Match outcome vote">
        {options.map((option) => (
          <button
            key={option.key}
            className={`wdw-chip ${selectedOutcome ? "" : "clickable"} ${selectedOutcome === option.key ? "active" : ""}`}
            type="button"
            onClick={() => onVote(option.key)}
            disabled={Boolean(selectedOutcome || isVoteSaving)}
          >
            <span>{option.label}</span>
            <strong>{formatVotePercent(option.count, totalVotes)}%</strong>
          </button>
        ))}
      </div>
      <div className="vote-count-row">
        <span>Home votes<strong>{voteCounts.home}</strong></span>
        <span>Draw votes<strong>{voteCounts.draw}</strong></span>
        <span>Away votes<strong>{voteCounts.away}</strong></span>
      </div>
      <div className="user-wdw">
        <span>Your pick</span>
        <strong>{selectedOutcome ? options.find((option) => option.key === selectedOutcome)?.label : "Choose one outcome"}</strong>
      </div>
    </div>
  );
}

function MatchDetailPanel({ detail, isLoading, error, homeName, awayName }) {
  if (isLoading && !detail) {
    return <div className="match-detail-panel"><p className="live-note">Loading live match details...</p></div>;
  }

  if (error && !detail) {
    return <div className="match-detail-panel"><p className="live-note">{error}</p></div>;
  }

  if (!detail) return null;

  const scoreHome = detail.score?.home ?? 0;
  const scoreAway = detail.score?.away ?? 0;

  return (
    <div className="match-detail-panel">
      <div className="match-detail-top">
        <div>
          <span className="detail-kicker">Live match center</span>
          <h3>{homeName} {scoreHome} - {scoreAway} {awayName}</h3>
          <p>{detail.summary}</p>
        </div>
        <span className="status-pill">{detail.status}</span>
      </div>

      {detail.stats?.length > 0 && (
        <div className="match-detail-stats">
          {detail.stats.map((stat) => (
            <div className="match-detail-stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="match-detail-grid">
        <LineupColumn title={`${homeName} lineup`} players={detail.lineups?.home || []} />
        <LineupColumn title={`${awayName} lineup`} players={detail.lineups?.away || []} />
      </div>

      <div className="match-detail-grid events">
        <EventList
          title="Goals"
          emptyText="No goals recorded yet."
          items={detail.events?.goals || []}
          renderItem={(item) => `${item.minute} ${item.scorer} (${item.team})${item.score ? ` - ${item.score}` : ""}`}
        />
        <EventList
          title="Bookings"
          emptyText="No cards recorded yet."
          items={detail.events?.bookings || []}
          renderItem={(item) => `${item.minute} ${item.player} (${item.team}) - ${item.card}`}
        />
        <EventList
          title="Substitutions"
          emptyText="No substitutions recorded yet."
          items={detail.events?.substitutions || []}
          renderItem={(item) => `${item.minute} ${item.team}: ${item.playerOut} off, ${item.playerIn} on`}
        />
      </div>
    </div>
  );
}

function LineupColumn({ title, players }) {
  return (
    <div className="lineup-column">
      <h4>{title}</h4>
      {!players.length && <p className="muted">Lineup not published yet.</p>}
      <ol>
        {players.map((player) => (
          <li key={`${title}-${player.shirtNumber || "x"}-${player.name}`}>
            <span className="lineup-shirt">{player.shirtNumber ?? "-"}</span>
            <span>
              <strong>{player.name}</strong>
              <small>{player.position}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EventList({ title, items, emptyText, renderItem }) {
  return (
    <div className="event-list">
      <h4>{title}</h4>
      {!items.length && <p className="muted">{emptyText}</p>}
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}-${renderItem(item)}`}>{renderItem(item)}</li>
        ))}
      </ul>
    </div>
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
      {team.recentForm && <RecentForm form={team.recentForm} leagueLabel={team.recentForm.leagueLabel || getDomesticLeagueLabel(team.id)} />}
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

function RecentForm({ form, leagueLabel }) {
  return (
    <div className="recent-form-grid">
      <FormColumn title="Champions League last 5" items={form.championsLeague} />
      <FormColumn title={`${leagueLabel} last 5`} items={form.league} />
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
          const displayName = String(prediction.name || "Fan");
          return (
            <div className="prediction-entry" key={prediction.id || `${prediction.timestamp || "recent"}-${displayName}-${prediction.champion || "pick"}`}>
              <span className="feed-avatar">{displayName.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{displayName}</strong>
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
  const timeValue = typeof timestamp === "string" ? Date.parse(timestamp) : timestamp;
  if (!timeValue || Number.isNaN(timeValue)) return "Recently";
  const seconds = Math.floor((now - timeValue) / 1000);
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

function formatVotePercent(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function isLiveStatus(status) {
  return ["in_play", "live", "paused"].includes(String(status || "").toLowerCase());
}

function formatMatchStatus(status) {
  const value = String(status || "unknown").replaceAll("_", " ");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDomesticLeagueLabel(teamId) {
  if (teamId === "bayern") return "Bundesliga";
  if (teamId === "arsenal") return "Premier League";
  if (teamId === "atleti") return "LaLiga";
  if (teamId === "psg") return "Ligue 1";
  return "League";
}

export default App;
