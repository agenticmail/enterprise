<?php
/**
 * Knowledge Contributions page - Community knowledge sharing hub
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Your Contributions</div>
        <div class="stat-value">12</div>
        <div class="stat-change" style="color: var(--success)">+3 this month</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Community Points</div>
        <div class="stat-value">1,847</div>
        <div class="stat-change" style="color: var(--success)">+127 this week</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Reputation Score</div>
        <div class="stat-value">4.8</div>
        <div class="stat-change" style="color: var(--success)">Top 10% contributor</div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>Knowledge Hub</h3>
        <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary">+ Share Knowledge</button>
            <button class="btn btn-secondary">My Contributions</button>
        </div>
    </div>
    <div class="card-body">
        <div style="display: flex; gap: 16px; margin-bottom: 20px;">
            <input type="text" class="input" placeholder="Search knowledge..." style="flex: 1;">
            <select class="input" style="width: auto;">
                <option>All Categories</option>
                <option>Best Practices</option>
                <option>Troubleshooting</option>
                <option>Integration</option>
                <option>Automation</option>
            </select>
            <select class="input" style="width: auto;">
                <option>Most Recent</option>
                <option>Most Popular</option>
                <option>Highest Rated</option>
            </select>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Optimizing Email Deliverability</h4>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge badge-success">Best Practice</span>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span>⭐</span>
                            <span style="color: var(--text-secondary);">4.9 (23)</span>
                        </div>
                    </div>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Comprehensive guide on improving email deliverability rates through proper DNS configuration, content optimization, and sender reputation management.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-muted);">
                        <span>by <strong>EmailExpert</strong></span>
                        <span>•</span>
                        <span>2 days ago</span>
                        <span>•</span>
                        <span>156 views</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Read More</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Debugging Agent Response Issues</h4>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge badge-warning">Troubleshooting</span>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span>⭐</span>
                            <span style="color: var(--text-secondary);">4.7 (18)</span>
                        </div>
                    </div>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Step-by-step troubleshooting guide for common agent response delays, timeout issues, and performance bottlenecks.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-muted);">
                        <span>by <strong>TechSolver</strong></span>
                        <span>•</span>
                        <span>5 days ago</span>
                        <span>•</span>
                        <span>203 views</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Read More</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Slack Integration Setup Guide</h4>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge badge-info">Integration</span>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span>⭐</span>
                            <span style="color: var(--text-secondary);">4.8 (31)</span>
                        </div>
                    </div>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Complete walkthrough for setting up Slack integration, including webhook configuration, bot permissions, and message formatting.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-muted);">
                        <span>by <strong>IntegrationPro</strong></span>
                        <span>•</span>
                        <span>1 week ago</span>
                        <span>•</span>
                        <span>89 views</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Read More</button>
                </div>
            </div>

            <div style="border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <h4 style="font-size: 14px; font-weight: 600;">Automated Workflow Templates</h4>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge badge-primary">Automation</span>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span>⭐</span>
                            <span style="color: var(--text-secondary);">4.6 (12)</span>
                        </div>
                    </div>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Collection of pre-built workflow templates for common business processes including customer onboarding, support ticketing, and lead nurturing.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-muted);">
                        <span>by <strong>WorkflowGuru</strong></span>
                        <span>•</span>
                        <span>2 weeks ago</span>
                        <span>•</span>
                        <span>67 views</span>
                    </div>
                    <button class="btn btn-sm btn-secondary">Read More</button>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card" style="margin-top: 24px;">
    <div class="card-header">
        <h3>Top Contributors</h3>
        <button class="btn btn-secondary">Leaderboard</button>
    </div>
    <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
            <div style="text-align: center; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius);">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px;">EE</div>
                <div style="font-weight: 600; font-size: 13px;">EmailExpert</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">3,247 points</div>
                <div style="font-size: 11px; color: var(--text-muted);">127 contributions</div>
            </div>
            <div style="text-align: center; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius);">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px;">TS</div>
                <div style="font-weight: 600; font-size: 13px;">TechSolver</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">2,891 points</div>
                <div style="font-size: 11px; color: var(--text-muted);">98 contributions</div>
            </div>
            <div style="text-align: center; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius);">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px;">IP</div>
                <div style="font-weight: 600; font-size: 13px;">IntegrationPro</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">2,156 points</div>
                <div style="font-size: 11px; color: var(--text-muted);">76 contributions</div>
            </div>
        </div>
    </div>
</div>