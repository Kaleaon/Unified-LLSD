use std::fmt;

#[derive(Debug, Clone, PartialEq, PartialOrd)]
pub struct LlDate {
    pub seconds_since_epoch: f64,
}

impl LlDate {
    pub const NULL: LlDate = LlDate { seconds_since_epoch: 0.0 };

    pub fn new(seconds: f64) -> Self {
        LlDate { seconds_since_epoch: seconds }
    }

    pub fn is_null(&self) -> bool {
        self.seconds_since_epoch == 0.0
    }

    pub fn not_null(&self) -> bool {
        !self.is_null()
    }

    pub fn from_iso_string(s: &str) -> Option<Self> {
        let clean = s.trim();
        if clean.is_empty() { return None; }
        // Basic ISO date parser YYYY-MM-DDTHH:MM:SS
        let parts: Vec<&str> = clean.trim_matches('Z').split('T').collect();
        if parts.len() != 2 { return None; }
        let date_parts: Vec<i32> = parts[0].split('-').filter_map(|p| p.parse().ok()).collect();
        let time_parts: Vec<f64> = parts[1].split(':').filter_map(|p| p.parse().ok()).collect();
        if date_parts.len() != 3 || time_parts.len() != 3 { return None; }

        let year = date_parts[0];
        let month = date_parts[1];
        let day = date_parts[2];
        let hour = time_parts[0] as i32;
        let min = time_parts[1] as i32;
        let sec = time_parts[2];

        // Simplified epoch calculation
        let mut days = (year - 1970) * 365 + (year - 1969) / 4;
        let days_in_months = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        for m in 1..month {
            days += days_in_months[m as usize];
        }
        if month > 2 && year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) {
            days += 1;
        }
        days += day - 1;

        let total_secs = (days as f64) * 86400.0 + (hour as f64) * 3600.0 + (min as f64) * 60.0 + sec;
        Some(LlDate { seconds_since_epoch: total_secs })
    }

    pub fn to_iso_string(&self) -> String {
        let total_secs = self.seconds_since_epoch.floor() as i64;
        let frac = self.seconds_since_epoch - (total_secs as f64);

        let mut days = total_secs / 86400;
        let mut rem_secs = total_secs % 86400;
        if rem_secs < 0 {
            rem_secs += 86400;
            days -= 1;
        }

        let hours = rem_secs / 3600;
        let mins = (rem_secs % 3600) / 60;
        let secs = rem_secs % 60;

        // Approximate year/month/day
        let mut year = 1970 + (days / 365) as i32;
        let mut day_of_year = (days % 365) as i32;
        if day_of_year < 0 {
            day_of_year += 365;
            year -= 1;
        }

        let days_in_months = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let mut month = 1;
        while month <= 12 && day_of_year >= days_in_months[month] {
            day_of_year -= days_in_months[month];
            month += 1;
        }
        let day = day_of_year + 1;

        if frac > 0.001 {
            format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:05.2}Z", year, month, day, hours, mins, (secs as f64) + frac)
        } else {
            format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hours, mins, secs)
        }
    }
}

impl Default for LlDate {
    fn default() -> Self {
        LlDate::NULL
    }
}

impl fmt::Display for LlDate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_iso_string())
    }
}
