import { useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import DashboardMap from './DashboardMap.jsx';

export default function Dashboard({ theme, onToggleTheme, onNavigateLanding }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'run', label: 'Run & Track', icon: 'run' },
    { id: 'map', label: 'Map & Territories', icon: 'map' },
    { id: 'challenges', label: 'Challenges', icon: 'trophy' },
    { id: 'communities', label: 'Communities', icon: 'group' },
    { id: 'leaderboard', label: 'Leaderboard', icon: 'chart' },
    { id: 'history', label: 'Activity History', icon: 'clock' },
  ];

  const leaderboardUsers = [
    { rank: 1, name: 'Aarya S.', distance: '186.4 km', avatar: 'AS', isUser: false },
    { rank: 2, name: 'Rohan P.', distance: '172.1 km', avatar: 'RP', isUser: false },
    { rank: 3, name: 'Prashant C.', distance: '124.8 km', avatar: 'PC', isUser: true },
    { rank: 4, name: 'Meera K.', distance: '118.3 km', avatar: 'MK', isUser: false },
    { rank: 5, name: 'Nishant V.', distance: '112.6 km', avatar: 'NV', isUser: false },
  ];

  const weeklyActivity = [
    { day: 'Mon', dist: 3.2, height: '35%' },
    { day: 'Tue', dist: 4.8, height: '52%' },
    { day: 'Wed', dist: 2.1, height: '24%' },
    { day: 'Thu', dist: 5.6, height: '62%' },
    { day: 'Fri', dist: 3.4, height: '38%' },
    { day: 'Sat', dist: 9.3, height: '100%', isPeak: true },
    { day: 'Sun', dist: 4.2, height: '48%' },
  ];

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDEBAR */}
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand" onClick={onNavigateLanding} role="button" tabIndex={0}>
          <div className="brand-logo-mark">
            <svg viewBox="0 0 28 28" width="24" height="24" fill="none">
              <path d="M4 22L12 4l6 10 6-10v18" stroke="var(--accent-lime)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-title font-heading">RUN & CONQUER</span>
            <span className="brand-tagline">RUN · CLAIM · DEFEND</span>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Dashboard Sidebar">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dashboard-nav-item ${activeTab === item.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon === 'home' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                )}
                {item.icon === 'run' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="2" />
                    <path d="M10 22v-6l-2-2 3-5 3 2 3-1" />
                    <path d="M7 11l3-1 2 3 4-2" />
                  </svg>
                )}
                {item.icon === 'map' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                )}
                {item.icon === 'trophy' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h3M18 9h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" />
                    <path d="M6 2h12v7a6 6 0 0 1-12 0V2zM12 15v5M8 20h8" />
                  </svg>
                )}
                {item.icon === 'group' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                )}
                {item.icon === 'chart' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                )}
                {item.icon === 'clock' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Large Naturally Integrated Athletic Runner */}
        <div className="sidebar-athlete-stage" aria-hidden="true">
          <div className="sidebar-athlete-glow" />
          <img
            src={theme === 'dark' ? '/assets/sidebar-runner-dark.png' : '/assets/sidebar-runner-light.png'}
            alt="Sprinter silhouette"
            className="sidebar-athlete-photo"
          />
        </div>

        {/* Sidebar Actions at the Very Bottom */}
        <div className="sidebar-footer-actions">
          <button type="button" className="sidebar-action-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
          <button type="button" className="sidebar-action-btn text-destructive" onClick={onNavigateLanding}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="dashboard-main">
        {/* TOP BAR / WELCOME HEADER */}
        <header className="dashboard-topbar">
          <div className="dashboard-welcome">
            <h1 className="welcome-title font-heading">Welcome back, Prashant 👋</h1>
            <p className="welcome-subtitle">Continue your conquest. New territory awaits.</p>
          </div>

          <div className="dashboard-top-actions">
            <div className="dashboard-search-wrap">
              <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search runners, communities, challenges..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dashboard-search-input"
              />
              <kbd className="search-kbd">Ctrl K</kbd>
            </div>

            <ThemeToggle theme={theme} onToggle={onToggleTheme} />

            <button type="button" className="dashboard-icon-btn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="notification-dot" />
            </button>

            <div className="user-profile-badge">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&h=80&q=80"
                alt="Prashant C."
                className="user-avatar-img"
              />
            </div>
          </div>
        </header>

        {/* 5 TOP METRIC CARDS */}
        <div className="dashboard-stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrap lime">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="2" />
                <path d="M10 22v-6l-2-2 3-5 3 2 3-1" />
                <path d="M7 11l3-1 2 3 4-2" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value font-heading">124.8 km</div>
              <div className="stat-label">Total Distance</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrap lime">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value font-heading">36</div>
              <div className="stat-label">Total Runs</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrap lime">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value font-heading">268</div>
              <div className="stat-label">Territories Owned</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrap lime">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h3M18 9h3a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" />
                <path d="M6 2h12v7a6 6 0 0 1-12 0V2zM12 15v5M8 20h8" />
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value font-heading">#3</div>
              <div className="stat-label">Global Rank</div>
            </div>
          </div>

          <div className="stat-card xp-level-card">
            <div className="stat-icon-wrap crown-wrap">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
            </div>
            <div className="stat-content full-width">
              <div className="xp-top-row">
                <span className="xp-level-title font-heading">Level 12</span>
                <span className="xp-ratio font-mono">5,420 / 7,000 XP</span>
                <span className="xp-arrow">→</span>
              </div>
              <div className="xp-sub">Territory Runner</div>
              <div className="xp-progress-track">
                <div className="xp-progress-bar" style={{ width: '77.4%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: TERRITORY MAP + RIGHT SIDEBAR CARDS */}
        <div className="dashboard-middle-grid">
          {/* Main Map */}
          <div className="middle-map-column">
            <DashboardMap theme={theme} />
          </div>

          {/* Right Column Stack */}
          <div className="middle-right-column">
            {/* Active Challenge Card */}
            <div className="challenge-card">
              <div className="challenge-card-header">
                <span className="challenge-tag font-mono">⚡ Active Challenge</span>
              </div>
              <div className="challenge-body">
                <div className="challenge-title-row">
                  <span className="challenge-title font-heading">Conquer 25 Hexes</span>
                  <span className="challenge-progress-count font-mono">14 / 25</span>
                </div>
                <div className="challenge-progress-track">
                  <div className="challenge-progress-bar" style={{ width: '56%' }} />
                </div>
                <div className="challenge-footer">
                  <span className="challenge-deadline">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    3 days left
                  </span>
                  <span className="challenge-arrow">→</span>
                </div>
              </div>
            </div>

            {/* Recent Activity Card */}
            <div className="recent-activity-card">
              <div className="recent-activity-header">
                <span className="recent-title font-heading">🏃 Recent Activity</span>
              </div>
              <div className="recent-activity-list">
                <div className="activity-item">
                  <div className="activity-sparkline">
                    <svg viewBox="0 0 40 20" width="40" height="20" fill="none" stroke="var(--accent-lime)" strokeWidth="2">
                      <path d="M0 15 Q10 5 20 12 T40 4" />
                    </svg>
                  </div>
                  <div className="activity-details">
                    <div className="activity-name font-heading">Evening Run</div>
                    <div className="activity-stats font-mono">5.42 km · 4:18 /km</div>
                  </div>
                  <div className="activity-time">2h ago</div>
                </div>

                <div className="activity-item">
                  <div className="activity-sparkline">
                    <svg viewBox="0 0 40 20" width="40" height="20" fill="none" stroke="var(--accent-lime)" strokeWidth="2">
                      <path d="M0 12 Q10 18 20 8 T40 10" />
                    </svg>
                  </div>
                  <div className="activity-details">
                    <div className="activity-name font-heading">Campus Loop</div>
                    <div className="activity-stats font-mono">3.10 km · 4:21 /km</div>
                  </div>
                  <div className="activity-time">Yesterday</div>
                </div>

                <div className="activity-item">
                  <div className="activity-sparkline">
                    <svg viewBox="0 0 40 20" width="40" height="20" fill="none" stroke="var(--accent-lime)" strokeWidth="2">
                      <path d="M0 8 Q10 4 20 14 T40 6" />
                    </svg>
                  </div>
                  <div className="activity-details">
                    <div className="activity-name font-heading">Territory Defense</div>
                    <div className="activity-stats font-mono">6.27 km · Strengthened</div>
                  </div>
                  <div className="activity-time">2 days ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: 4 CARDS */}
        <div className="dashboard-bottom-grid">
          {/* Leaderboard Card */}
          <div className="bottom-card leaderboard-card">
            <div className="bottom-card-header">
              <span className="bottom-card-title font-heading">Leaderboard <small>(This Week)</small></span>
              <a href="#leaderboard" className="card-link font-mono">View All →</a>
            </div>
            <div className="leaderboard-list">
              {leaderboardUsers.map((u) => (
                <div key={u.rank} className={`leaderboard-row ${u.isUser ? 'is-current-user' : ''}`}>
                  <span className={`rank-badge rank-${u.rank}`}>{u.rank}</span>
                  <div className="user-cell">
                    <span className="user-avatar-tiny">{u.avatar}</span>
                    <span className="user-name">{u.name}</span>
                  </div>
                  <span className="user-distance font-mono">{u.distance}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Your Activity Chart Card */}
          <div className="bottom-card activity-chart-card">
            <div className="bottom-card-header">
              <span className="bottom-card-title font-heading">Your Activity <small>(This Week)</small></span>
            </div>
            <div className="activity-stats-summary">
              <span className="activity-total font-heading">28.4 km</span>
              <span className="activity-trend-badge font-mono">↑ +12%</span>
            </div>
            <div className="weekly-bar-chart">
              {weeklyActivity.map((w) => (
                <div key={w.day} className="chart-bar-col">
                  <div className="chart-bar-track">
                    <div
                      className={`chart-bar-fill ${w.isPeak ? 'is-peak' : ''}`}
                      style={{ height: w.height }}
                      title={`${w.day}: ${w.dist} km`}
                    />
                  </div>
                  <span className="chart-bar-label font-mono">{w.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Your Communities Card */}
          <div className="bottom-card communities-card">
            <div className="bottom-card-header">
              <span className="bottom-card-title font-heading">Your Communities</span>
              <a href="#communities" className="card-link font-mono">View All →</a>
            </div>
            <div className="communities-list">
              <div className="community-item">
                <div className="community-icon-badge gold">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polygon points="12 8 10 13 14 13 12 18" fill="currentColor" />
                  </svg>
                </div>
                <div className="community-info">
                  <div className="community-name font-heading">Vajra Clan</div>
                  <div className="community-members">142 Members</div>
                </div>
                <span className="community-arrow">→</span>
              </div>

              <div className="community-item">
                <div className="community-icon-badge green">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="community-info">
                  <div className="community-name font-heading">College Runners</div>
                  <div className="community-members">328 Members</div>
                </div>
                <span className="community-arrow">→</span>
              </div>
            </div>
          </div>

          {/* Achievements Card */}
          <div className="bottom-card achievements-card">
            <div className="bottom-card-header">
              <span className="bottom-card-title font-heading">Achievements</span>
              <a href="#achievements" className="card-link font-mono">View All →</a>
            </div>
            <div className="achievements-badges-row">
              <div className="achievement-badge-pod">
                <div className="achievement-hex-badge">
                  <svg viewBox="0 0 40 46" width="36" height="42" fill="none" stroke="var(--accent-lime)" strokeWidth="1.5">
                    <polygon points="20 1 38 11.5 38 34.5 20 45 2 34.5 2 11.5 20 1" />
                    <circle cx="20" cy="17" r="3" fill="var(--accent-lime)" />
                    <path d="M16 28v-5l2-2 4 1 2-2" stroke="var(--accent-lime)" strokeWidth="1.5" />
                  </svg>
                </div>
                <span className="achievement-label font-mono">10 Runs</span>
              </div>

              <div className="achievement-badge-pod">
                <div className="achievement-hex-badge">
                  <svg viewBox="0 0 40 46" width="36" height="42" fill="none" stroke="var(--accent-lime)" strokeWidth="1.5">
                    <polygon points="20 1 38 11.5 38 34.5 20 45 2 34.5 2 11.5 20 1" />
                    <polygon points="12 30 20 16 28 30" fill="none" stroke="var(--accent-lime)" strokeWidth="1.5" />
                  </svg>
                </div>
                <span className="achievement-label font-mono">50 km</span>
              </div>

              <div className="achievement-badge-pod">
                <div className="achievement-hex-badge">
                  <svg viewBox="0 0 40 46" width="36" height="42" fill="none" stroke="var(--accent-lime)" strokeWidth="1.5">
                    <polygon points="20 1 38 11.5 38 34.5 20 45 2 34.5 2 11.5 20 1" />
                    <path d="M14 28V15s2-1 6 1 6-1 6-1v8s-2 1-6-1-6 1-6 1" stroke="var(--accent-lime)" strokeWidth="1.5" />
                  </svg>
                </div>
                <span className="achievement-label font-mono">First Claim</span>
              </div>

              <div className="achievement-badge-pod">
                <div className="achievement-hex-badge">
                  <svg viewBox="0 0 40 46" width="36" height="42" fill="none" stroke="var(--accent-lime)" strokeWidth="1.5">
                    <polygon points="20 1 38 11.5 38 34.5 20 45 2 34.5 2 11.5 20 1" />
                    <path d="M14 16h12v7a6 6 0 0 1-12 0v-7z" stroke="var(--accent-lime)" strokeWidth="1.5" />
                  </svg>
                </div>
                <span className="achievement-label font-mono">Defender</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
