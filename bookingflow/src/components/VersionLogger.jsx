import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// גרסה - עדכן כאן בכל עדכון
const BUILD_VERSION = '1.6.0';
const BUILD_DATE = '12/03/2026 - Switch to eCommerce checkout, remove personal-details step, iframe-only flow';

// מאפשר שימוש מחוץ לקומפוננטה (לדוגמה ב-footer)
export const APP_VERSION = BUILD_VERSION;
export const APP_BUILD_DATE = BUILD_DATE;

// Store for logs
const logs = [];
const maxLogs = 50;

// Throttle state למניעת עדכונים מרובים
let updateScheduled = false;
const UPDATE_THROTTLE_DELAY = 500; // 500ms בין עדכונים

// Batch logs למניעת עדכונים מרובים
const pendingLogs = [];
let batchTimeout = null;
const BATCH_DELAY = 300; // 300ms לאיסוף logs

// בדיקה אם אנחנו בסביבת פיתוח
const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

/**
 * Function to add log
 * עם throttle ו-batch updates לחיסכון בביצועים
 */
export const addLog = (message, type = 'info') => {
  const logEntry = {
    id: Date.now() + Math.random(), // unique id גם אם נוספים כמה logs באותו ms
    timestamp: new Date().toLocaleTimeString('he-IL'),
    message,
    type // 'info', 'success', 'warning', 'error'
  };
  
  // הוספה ל-pending logs
  pendingLogs.push(logEntry);
  
  // Batch - איסוף כמה logs לעדכון אחד
  if (!batchTimeout) {
    batchTimeout = setTimeout(() => {
      // העברת כל ה-pending logs ל-logs הראשי
      logs.push(...pendingLogs);
      pendingLogs.length = 0;
      
      // שמירה על מקסימום logs
      while (logs.length > maxLogs) {
        logs.shift();
      }
      
      // Throttle - עדכון מקסימום פעם ב-500ms
      if (!updateScheduled && window.versionLoggerUpdate) {
        updateScheduled = true;
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (window.versionLoggerUpdate) {
              window.versionLoggerUpdate();
            }
            updateScheduled = false;
          }, UPDATE_THROTTLE_DELAY);
        });
      }
      
      batchTimeout = null;
    }, BATCH_DELAY);
  }
};

export default function VersionLogger() {
  const [isOpen, setIsOpen] = useState(false);
  const [logEntries, setLogEntries] = useState([]);

  useEffect(() => {
    // Initial log
    addLog('Booking component loaded', 'success');
    addLog(`Build Version: ${BUILD_VERSION}`, 'info');
    addLog(`Build Date: ${BUILD_DATE}`, 'info');

    // Update function for external calls
    window.versionLoggerUpdate = () => {
      setLogEntries([...logs]);
    };

    // Initial render
    setLogEntries([...logs]);

    return () => {
      delete window.versionLoggerUpdate;
      // ניקוי timers
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }
    };
  }, []);

  const getLogColor = (type) => {
    switch (type) {
      case 'success': return 'text-green-600 bg-green-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-red-600 bg-red-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[10000] font-mono text-xs">
      {/* Version Badge - CSS hover במקום framer-motion */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg
          bg-white border border-gray-200 hover:border-blue-400 hover:scale-105 active:scale-95
          transition-all duration-200"
      >
        <Info className="w-4 h-4 text-blue-600" />
        <span className="font-semibold text-blue-600">v{BUILD_VERSION}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Logs Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-2 w-80 max-h-96 overflow-hidden bg-white rounded-lg shadow-xl border border-gray-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
              <div>
                <h3 className="font-semibold text-gray-800">Version Logger</h3>
                <p className="text-xs text-gray-500">Build: {BUILD_DATE}</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Logs */}
            <div className="overflow-y-auto max-h-64 p-2">
              {logEntries.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No logs yet</p>
              ) : (
                logEntries.map((log) => (
                  <div
                    key={log.id}
                    className={`mb-2 p-2 rounded ${getLogColor(log.type)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 font-mono text-[10px]">
                        {log.timestamp}
                      </span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
