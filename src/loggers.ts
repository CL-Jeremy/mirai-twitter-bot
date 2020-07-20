import { getLogger as _getLogger, Logger } from 'log4js';

const loggers: Logger[] = [];

export function getLogger(category?: string): Logger {
    const l = _getLogger(category);
    l.level = 'info';
    loggers.push(l);
    return l;
}

export function setLogLevels(level?: string): void {
    loggers.forEach((l: Logger) => l.level = level ?? 'info');
}
