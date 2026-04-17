import React, { useCallback, useEffect, useState } from 'react';
import DatabaseInitializer from '../../services/databaseInit.js';
import { Database, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

const DatabaseStatus = ({ onConnectionChange }) => {
  const [status, setStatus] = useState({
    connected: false,
    loading: true,
    error: null,
    lastChecked: null
  });

  const checkConnection = useCallback(async () => {
    try {
      setStatus(prev => ({ ...prev, loading: true, error: null }));
      const result = await DatabaseInitializer.verifyConnection();
      setStatus(prev => ({
        ...prev,
        connected: result.connected,
        loading: false,
        error: result.connected ? null : result.error,
        lastChecked: result.timestamp
      }));
      onConnectionChange?.(result.connected);
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        connected: false,
        loading: false,
        error: error.message,
        lastChecked: new Date().toISOString()
      }));
      onConnectionChange?.(false);
    }
  }, [onConnectionChange]);

  useEffect(() => {
    void checkConnection();
    const interval = setInterval(() => {
      void checkConnection();
    }, 30000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const getStatusColor = () => {
    if (status.loading) return '#FF9800';
    if (status.connected) return '#4CAF50';
    return '#f44336';
  };

  const getStatusIcon = () => {
    if (status.loading) return <RefreshCw size={16} className="animate-spin" />;
    if (status.connected) return <CheckCircle size={16} />;
    return <XCircle size={16} />;
  };

  const getStatusText = () => {
    if (status.loading) return '检测中';
    if (status.connected) return '已连接';
    if (status.error?.includes('Db or Table not exist') || status.error?.includes('DATABASE_COLLECTION_NOT_EXIST')) {
      return '集合未就绪';
    }
    return '连接异常';
  };

  const getStatusDetail = () => {
    if (!status.error) {
      return null;
    }

    if (status.error.includes('Db or Table not exist') || status.error.includes('DATABASE_COLLECTION_NOT_EXIST')) {
      return '请检查 users、tag_categories、tags、user_tags 是否已创建';
    }

    return status.error;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      backgroundColor: `${getStatusColor()}20`,
      border: `1px solid ${getStatusColor()}40`,
      borderRadius: '6px',
      fontSize: '12px',
      color: getStatusColor(),
      transition: 'all 0.3s ease'
    }}>
      <Database size={14} />
      {getStatusIcon()}
      <span style={{ fontWeight: 500 }}>
        CloudBase：{getStatusText()}
      </span>
      {getStatusDetail() && (
        <span style={{ fontSize: '10px', opacity: 0.8 }}>
          ({getStatusDetail()})
        </span>
      )}
      <button
        onClick={checkConnection}
        style={{
          padding: '2px 6px',
          border: `1px solid ${getStatusColor()}`,
          borderRadius: '4px',
          backgroundColor: 'transparent',
          color: getStatusColor(),
          cursor: 'pointer',
          fontSize: '10px',
          marginLeft: '4px'
        }}
        title="刷新云端连接状态"
      >
        <RefreshCw size={10} />
      </button>
    </div>
  );
};

export default DatabaseStatus;
