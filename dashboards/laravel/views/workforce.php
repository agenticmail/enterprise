<?php
/**
 * Workforce page - Agent workforce management and scheduling
 */
?>

<div class="stat-grid">
    <div class="stat-card">
        <div class="stat-label">Total Agents</div>
        <div class="stat-value">23</div>
        <div class="stat-change" style="color: var(--success)">+2 this month</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Active Now</div>
        <div class="stat-value">18</div>
        <div class="stat-change" style="color: var(--success)">78% utilization</div>
    </div>
    <div class="stat-card">
        <div class="stat-label">Tasks Completed</div>
        <div class="stat-value">1,847</div>
        <div class="stat-change" style="color: var(--success)">+12% vs yesterday</div>
    </div>
</div>

<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 24px;">
    <div class="card">
        <div class="card-header">
            <h3>Agent Activity Timeline</h3>
            <select class="input" style="width: auto;">
                <option>Last 24 Hours</option>
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
            </select>
        </div>
        <div class="card-body">
            <div style="background: var(--bg-tertiary); border-radius: var(--radius); padding: 20px; text-align: center; margin-bottom: 16px;">
                <div style="font-size: 36px; margin-bottom: 8px; color: var(--text-muted);">📊</div>
                <p style="color: var(--text-muted); font-size: 13px;">Activity timeline chart will be displayed here</p>
                <p style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Showing agent workload and task distribution over time</p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
                <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius);">
                    <div style="font-size: 18px; font-weight: 600; color: var(--success);">127</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Tasks Today</div>
                </div>
                <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius);">
                    <div style="font-size: 18px; font-weight: 600; color: var(--accent);">4.2h</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Avg Duration</div>
                </div>
                <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius);">
                    <div style="font-size: 18px; font-weight: 600; color: var(--warning);">12</div>
                    <div style="font-size: 11px; color: var(--text-muted);">In Queue</div>
                </div>
                <div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius);">
                    <div style="font-size: 18px; font-weight: 600; color: var(--info);">97.2%</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Success Rate</div>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-header">
            <h3>Workload Distribution</h3>
            <button class="btn btn-secondary btn-sm">Balance</button>
        </div>
        <div class="card-body">
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 12px; font-weight: 600;">Customer Support</span>
                        <span style="font-size: 11px; color: var(--text-muted);">8 agents</span>
                    </div>
                    <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: 85%; background: var(--success); border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">85% capacity</div>
                </div>
                
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 12px; font-weight: 600;">Sales</span>
                        <span style="font-size: 11px; color: var(--text-muted);">5 agents</span>
                    </div>
                    <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: 67%; background: var(--accent); border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">67% capacity</div>
                </div>
                
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 12px; font-weight: 600;">Marketing</span>
                        <span style="font-size: 11px; color: var(--text-muted);">4 agents</span>
                    </div>
                    <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: 92%; background: var(--warning); border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">92% capacity</div>
                </div>
                
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 12px; font-weight: 600;">Operations</span>
                        <span style="font-size: 11px; color: var(--text-muted);">6 agents</span>
                    </div>
                    <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: 73%; background: var(--info); border-radius: 3px;"></div>
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">73% capacity</div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="card">
    <div class="card-header">
        <h3>Agent Status</h3>
        <div style="display: flex; gap: 8px;">
            <input type="text" class="input" placeholder="Search agents..." style="width: 200px;">
            <select class="input" style="width: auto;">
                <option>All Agents</option>
                <option>Active</option>
                <option>Idle</option>
                <option>Offline</option>
            </select>
            <button class="btn btn-primary">Schedule Task</button>
        </div>
    </div>
    <div class="card-body">
        <table>
            <thead>
                <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Current Task</th>
                    <th>Workload</th>
                    <th>Performance</th>
                    <th>Next Available</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">A</div>
                            <span style="font-weight: 500;">Alice</span>
                        </div>
                    </td>
                    <td><span class="badge badge-success">Active</span></td>
                    <td>
                        <div style="font-size: 12px;">Processing customer inquiry</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Started 15 mins ago</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 40px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
                                <div style="width: 75%; height: 100%; background: var(--warning);"></div>
                            </div>
                            <span style="font-size: 11px;">75%</span>
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 12px; font-weight: 600; color: var(--success);">98.2%</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Success rate</div>
                    </td>
                    <td>In 2 hours</td>
                    <td>
                        <button class="btn btn-sm btn-secondary">Reassign</button>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">B</div>
                            <span style="font-weight: 500;">Bob</span>
                        </div>
                    </td>
                    <td><span class="badge badge-warning">Idle</span></td>
                    <td>
                        <div style="font-size: 12px; color: var(--text-muted);">Waiting for next task</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Idle for 8 mins</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 40px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
                                <div style="width: 20%; height: 100%; background: var(--success);"></div>
                            </div>
                            <span style="font-size: 11px;">20%</span>
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 12px; font-weight: 600; color: var(--success);">96.7%</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Success rate</div>
                    </td>
                    <td>Available now</td>
                    <td>
                        <button class="btn btn-sm btn-primary">Assign Task</button>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--warning-soft); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">C</div>
                            <span style="font-weight: 500;">Charlie</span>
                        </div>
                    </td>
                    <td><span class="badge badge-success">Active</span></td>
                    <td>
                        <div style="font-size: 12px;">Generating sales report</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Started 45 mins ago</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 40px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
                                <div style="width: 90%; height: 100%; background: var(--danger);"></div>
                            </div>
                            <span style="font-size: 11px;">90%</span>
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 12px; font-weight: 600; color: var(--success);">94.1%</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Success rate</div>
                    </td>
                    <td>In 4 hours</td>
                    <td>
                        <button class="btn btn-sm btn-secondary">Monitor</button>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--info-soft); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">D</div>
                            <span style="font-weight: 500;">Diana</span>
                        </div>
                    </td>
                    <td><span class="badge badge-danger">Offline</span></td>
                    <td>
                        <div style="font-size: 12px; color: var(--text-muted);">Scheduled maintenance</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Offline for 2 hours</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="width: 40px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden;">
                                <div style="width: 0%; height: 100%; background: var(--text-muted);"></div>
                            </div>
                            <span style="font-size: 11px;">0%</span>
                        </div>
                    </td>
                    <td>
                        <div style="font-size: 12px; font-weight: 600; color: var(--success);">99.1%</div>
                        <div style="font-size: 10px; color: var(--text-muted);">Success rate</div>
                    </td>
                    <td>In 30 mins</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" disabled>Offline</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>