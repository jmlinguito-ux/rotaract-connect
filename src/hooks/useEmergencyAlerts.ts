import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { EmergencyAlert } from '../types';
import {
  initEmergencyListener,
  getLatestReceivedAlert,
  clearLatestReceivedAlert,
} from '../services/emergencyBroadcast';

export function useEmergencyAlerts() {
  const { user } = useAuth();
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(() => getLatestReceivedAlert()?.alert ?? null);
  const [distanceMetersAway, setDistanceMetersAway] = useState<number | undefined>(() => getLatestReceivedAlert()?.distanceMetersAway);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = initEmergencyListener(
      user,
      (alert, dist) => {
        setActiveAlert(alert);
        setDistanceMetersAway(dist);
      },
      (resolvedAlertId) => {
        setActiveAlert(current => (current?.id === resolvedAlertId ? null : current));
        if (getLatestReceivedAlert()?.alert.id === resolvedAlertId) {
          clearLatestReceivedAlert();
        }
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const dismissAlert = () => {
    setActiveAlert(null);
    setDistanceMetersAway(undefined);
    clearLatestReceivedAlert();
  };

  return {
    activeAlert,
    distanceMetersAway,
    dismissAlert,
  };
}
