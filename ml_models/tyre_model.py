import numpy as np

class BayesianTyreDegradationModel:
    """
    A simplified Bayesian State-Space model for tyre degradation estimation.
    Uses an Unscented Kalman Filter approach (simplified) to estimate hidden tyre wear
    states based on observed telemetry (speed, lateral G, longitudinal G).
    """
    
    # Base wear coefficients by compound
    COMPOUND_COEFS = {
        'SOFT': 0.045,
        'MEDIUM': 0.025,
        'HARD': 0.015,
        'INTERMEDIATE': 0.05,
        'WET': 0.035,
        'UNKNOWN': 0.03
    }

    def __init__(self, track_abrasion=1.0, base_temp=30.0):
        self.track_abrasion = track_abrasion
        self.base_temp = base_temp
        
        # State: [Wear Level (0-100), Current Temp]
        self.state_mean = np.array([0.0, base_temp])
        self.state_cov = np.eye(2) * 1.0

        # Process noise covariance
        self.Q = np.array([[0.1, 0.0],
                           [0.0, 2.0]])
        
        # Observation noise covariance
        self.R = np.array([[5.0]])

    def predict_step(self, speed, braking, cornering, compound):
        """
        Predict the next state based on inputs.
        """
        base_wear_rate = self.COMPOUND_COEFS.get(compound, 0.03)
        
        # Non-linear wear function
        energy = (speed / 300.0)**2 + (braking / 100.0)**2 + (cornering)**2
        wear_increment = base_wear_rate * self.track_abrasion * (1.0 + 0.5 * energy)
        
        # Temp dynamics
        target_temp = self.base_temp + (energy * 50.0)
        temp_delta = (target_temp - self.state_mean[1]) * 0.1
        
        # Update mean
        self.state_mean[0] += wear_increment
        self.state_mean[1] += temp_delta
        
        # Expand covariance
        self.state_cov = self.state_cov + self.Q

    def update_step(self, observed_grip):
        """
        Update the state estimate based on an observation (e.g. inferred grip from slip angle).
        For this simplified model, we use a basic Kalman gain.
        """
        # H matrix (mapping state to observation)
        # Assume observed grip is inversely proportional to wear
        H = np.array([[-0.5, 0.0]])
        
        # Innovation
        predicted_obs = 100.0 - (self.state_mean[0] * 0.5)
        y = observed_grip - predicted_obs
        
        # Innovation covariance
        S = H.dot(self.state_cov).dot(H.T) + self.R
        
        # Kalman gain
        K = self.state_cov.dot(H.T).dot(np.linalg.inv(S))
        
        # Update state
        self.state_mean = self.state_mean + K.dot(y).flatten()
        self.state_cov = self.state_cov - K.dot(H).dot(self.state_cov)
        
        # Constrain wear to 0-100
        self.state_mean[0] = max(0.0, min(100.0, self.state_mean[0]))

    def estimate_health(self):
        """Returns the estimated tyre health (100 is new, 0 is dead)."""
        return 100.0 - self.state_mean[0]

    def reset(self):
        """Reset state for a new tyre."""
        self.state_mean = np.array([0.0, self.base_temp])
        self.state_cov = np.eye(2) * 1.0

def calculate_tyre_health(compound, laps_run, track_abrasion=1.0):
    """
    A utility function to quickly estimate tyre health over a stint without running
    the full filter over time-series data.
    """
    model = BayesianTyreDegradationModel(track_abrasion=track_abrasion)
    
    # Simulate laps
    for _ in range(int(laps_run)):
        # Simulate average lap dynamics
        # speed (km/h), braking (%), cornering (g)
        for _ in range(20): # 20 mini-steps per lap
            model.predict_step(200, 20, 2.0, compound)
            
    return max(0.0, model.estimate_health())
