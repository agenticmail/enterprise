/**
 * Port Security Scanner
 * 
 * Scans localhost for open ports and detects unexpected services
 */

import { createConnection } from 'net';

export interface PortScanResult {
  ports: number[];
  timestamp: string;
  scanDuration: number;
  newPorts: number[];
  closedPorts: number[];
}

export interface PortSecurityAlert {
  type: 'new_port' | 'unexpected_service' | 'scan_error';
  port?: number;
  service?: string;
  timestamp: string;
  details: string;
}

/**
 * Well-known port to service mapping
 */
const WELL_KNOWN_PORTS: { [key: number]: string } = {
  21: 'FTP',
  22: 'SSH',
  23: 'Telnet',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  993: 'IMAPS',
  995: 'POP3S',
  3000: 'Development Server',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  6379: 'Redis',
  8080: 'HTTP Alt',
  8443: 'HTTPS Alt',
  9000: 'Development',
  27017: 'MongoDB'
};

/**
 * Commonly scanned port ranges
 */
const DEFAULT_SCAN_PORTS = [
  // System ports (0-1023)
  21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995,
  // Common services (1024-49151)
  1433, 1521, 3000, 3306, 3389, 5432, 5984, 6379, 8080, 8443, 8888, 9000,
  // Dynamic/private ports (49152-65535) - limited selection
  50000, 55555, 60000
];

/**
 * Scan a single port for connectivity
 */
function scanPort(host: string, port: number, timeout: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host, timeout });
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Scan multiple ports concurrently
 */
async function scanPortRange(
  host: string, 
  ports: number[], 
  concurrency: number = 10,
  timeout: number = 1000
): Promise<number[]> {
  const openPorts: number[] = [];
  const chunks: number[][] = [];
  
  // Split ports into chunks for concurrent scanning
  for (let i = 0; i < ports.length; i += concurrency) {
    chunks.push(ports.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(port => 
      scanPort(host, port, timeout).then(isOpen => ({ port, isOpen }))
    );
    
    const results = await Promise.all(promises);
    
    for (const result of results) {
      if (result.isOpen) {
        openPorts.push(result.port);
      }
    }
  }
  
  return openPorts.sort((a, b) => a - b);
}

/**
 * Get service name for a port
 */
function getServiceName(port: number): string {
  return WELL_KNOWN_PORTS[port] || 'Unknown Service';
}

/**
 * Detect potentially dangerous services
 */
function analyzeDangerousServices(ports: number[]): PortSecurityAlert[] {
  const alerts: PortSecurityAlert[] = [];
  
  const dangerousPorts = [
    { port: 23, reason: 'Telnet (unencrypted)' },
    { port: 21, reason: 'FTP (often unencrypted)' },
    { port: 135, reason: 'RPC Endpoint Mapper' },
    { port: 139, reason: 'NetBIOS Session Service' },
    { port: 445, reason: 'SMB over IP' },
    { port: 1433, reason: 'SQL Server' },
    { port: 3389, reason: 'RDP' },
    { port: 5900, reason: 'VNC' },
    { port: 6000, reason: 'X11' }
  ];
  
  for (const port of ports) {
    const dangerous = dangerousPorts.find(d => d.port === port);
    if (dangerous) {
      alerts.push({
        type: 'unexpected_service',
        port,
        service: getServiceName(port),
        timestamp: new Date().toISOString(),
        details: `Potentially dangerous service detected: ${dangerous.reason}`
      });
    }
  }
  
  return alerts;
}

/**
 * Main port scanning function
 */
export async function scanPorts(
  host: string = 'localhost',
  portsToScan: number[] = DEFAULT_SCAN_PORTS,
  previousScan?: { ports: number[]; timestamp: string }
): Promise<PortScanResult> {
  const startTime = Date.now();
  
  try {
    const openPorts = await scanPortRange(host, portsToScan);
    const endTime = Date.now();
    
    const result: PortScanResult = {
      ports: openPorts,
      timestamp: new Date().toISOString(),
      scanDuration: endTime - startTime,
      newPorts: [],
      closedPorts: []
    };
    
    // Compare with previous scan if available
    if (previousScan) {
      const previousPorts = previousScan.ports;
      result.newPorts = openPorts.filter(port => !previousPorts.includes(port));
      result.closedPorts = previousPorts.filter(port => !openPorts.includes(port));
    }
    
    return result;
  } catch (error) {
    throw new Error(`Port scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate security alerts from scan results
 */
export function generatePortAlerts(
  scanResult: PortScanResult,
  allowedPorts: number[]
): PortSecurityAlert[] {
  const alerts: PortSecurityAlert[] = [];
  
  // Alert on new ports
  for (const port of scanResult.newPorts) {
    if (!allowedPorts.includes(port)) {
      alerts.push({
        type: 'new_port',
        port,
        service: getServiceName(port),
        timestamp: scanResult.timestamp,
        details: `New unauthorized port detected: ${port} (${getServiceName(port)})`
      });
    }
  }
  
  // Alert on dangerous services
  const dangerousAlerts = analyzeDangerousServices(scanResult.ports);
  alerts.push(...dangerousAlerts);
  
  return alerts;
}

/**
 * Continuous port monitoring
 */
export class PortMonitor {
  private intervalId?: NodeJS.Timeout;
  private lastScanResult?: PortScanResult;
  private alertCallback?: (alerts: PortSecurityAlert[]) => void;
  
  constructor(
    private config: {
      host?: string;
      ports?: number[];
      allowedPorts?: number[];
      intervalMinutes?: number;
    } = {}
  ) {}
  
  setAlertCallback(callback: (alerts: PortSecurityAlert[]) => void): void {
    this.alertCallback = callback;
  }
  
  async start(): Promise<void> {
    const intervalMinutes = this.config.intervalMinutes || 60;
    
    // Initial scan
    await this.performScan();
    
    // Schedule periodic scans
    this.intervalId = setInterval(() => {
      this.performScan().catch(error => {
        const alert: PortSecurityAlert = {
          type: 'scan_error',
          timestamp: new Date().toISOString(),
          details: `Port scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
        
        if (this.alertCallback) {
          this.alertCallback([alert]);
        }
      });
    }, intervalMinutes * 60 * 1000);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
  
  private async performScan(): Promise<void> {
    const scanResult = await scanPorts(
      this.config.host,
      this.config.ports,
      this.lastScanResult
    );
    
    const alerts = generatePortAlerts(
      scanResult,
      this.config.allowedPorts || []
    );
    
    if (alerts.length > 0 && this.alertCallback) {
      this.alertCallback(alerts);
    }
    
    this.lastScanResult = scanResult;
  }
  
  getLastScanResult(): PortScanResult | undefined {
    return this.lastScanResult;
  }
}

/**
 * Quick security check for development environments
 */
export async function quickSecurityCheck(): Promise<{
  safe: boolean;
  warnings: string[];
  openPorts: number[];
}> {
  const warnings: string[] = [];
  
  try {
    const commonDangerousPorts = [21, 23, 135, 139, 445, 3389, 5900];
    const openPorts = await scanPortRange('localhost', commonDangerousPorts, 5, 500);
    
    if (openPorts.includes(23)) {
      warnings.push('Telnet server is running (unencrypted)');
    }
    
    if (openPorts.includes(21)) {
      warnings.push('FTP server is running (potentially unencrypted)');
    }
    
    if (openPorts.includes(3389)) {
      warnings.push('RDP is exposed (Windows Remote Desktop)');
    }
    
    if (openPorts.includes(5900)) {
      warnings.push('VNC server is running (potentially unencrypted)');
    }
    
    const safe = warnings.length === 0;
    
    return {
      safe,
      warnings,
      openPorts
    };
  } catch (error) {
    return {
      safe: false,
      warnings: [`Security check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      openPorts: []
    };
  }
}