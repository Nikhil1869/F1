import sys
import fastf1
from app import app
from models import db, SeasonResult

def backfill_season(year):
    print(f"Starting backfill for {year}...")
    with app.app_context():
        schedule = fastf1.get_event_schedule(year)

        for _, event in schedule.iterrows():
            if event['EventFormat'] == 'testing':
                continue
                
            from pandas import Timestamp
            if event.get('EventDate') and event['EventDate'] > Timestamp.now():
                # Skip future races
                continue

            round_num = event['RoundNumber']
            event_name = event['EventName']
            print(f"Processing Round {round_num}: {event_name}")
            
            try:
                session = fastf1.get_session(year, round_num, 'R')
                session.load(telemetry=False, weather=False, messages=False)

                if session.results is None or session.results.empty:
                    print(f"  No results found for Round {round_num}")
                    continue

                for _, driver in session.results.iterrows():
                    # Check if exists
                    existing = SeasonResult.query.filter_by(
                        year=year,
                        round=round_num,
                        driver_number=str(driver['DriverNumber'])
                    ).first()

                    if not existing:
                        # Sometimes grids/positions are not integers (e.g. NaN for DNS)
                        try:
                            grid_pos = int(driver['GridPosition'])
                        except:
                            grid_pos = 20
                            
                        try:
                            fin_pos = int(driver['Position'])
                        except:
                            fin_pos = 20

                        result = SeasonResult(
                            year=year,
                            round=round_num,
                            event_name=event_name,
                            driver_number=str(driver['DriverNumber']),
                            driver_code=str(driver['Abbreviation']),
                            team=str(driver['TeamName']),
                            grid_position=grid_pos,
                            finish_position=fin_pos,
                            points=float(driver['Points']),
                            status=str(driver['Status'])
                        )
                        db.session.add(result)
                db.session.commit()
                print(f"  Saved Round {round_num}")
            except Exception as e:
                db.session.rollback()
                print(f"  Error processing Round {round_num}: {e}")
                
    print(f"Backfill for {year} complete.")

if __name__ == "__main__":
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2024
    backfill_season(year)
