import os
import fastf1
import fastf1.plotting
import matplotlib.pyplot as plt

os.makedirs("output", exist_ok=True)
os.makedirs("fastf1_cache", exist_ok=True)
fastf1.Cache.enable_cache("fastf1_cache")
fastf1.plotting.setup_mpl()


def main():
    driver_1 = "VER"
    driver_2 = "LEC"

    print("Loading 2024 Bahrain Qualifying session...")
    session = fastf1.get_session(2024, "Bahrain", "Q")
    session.load()

    print(f"Comparing fastest laps: {driver_1} vs {driver_2}")

    fastest_1 = session.laps.pick_driver(driver_1).pick_fastest()
    fastest_2 = session.laps.pick_driver(driver_2).pick_fastest()

    tel1 = fastest_1.get_telemetry().add_distance()
    tel2 = fastest_2.get_telemetry().add_distance()

    try:
        color_1 = fastf1.plotting.driver_color(driver_1)
        color_2 = fastf1.plotting.driver_color(driver_2)
    except AttributeError:
        color_1 = "blue"
        color_2 = "red"

    fig, axes = plt.subplots(3, 1, figsize=(15, 10), sharex=True)
    fig.suptitle(f"Qualifying Lap: {driver_1} vs {driver_2} — Bahrain 2024", fontsize=16)

    axes[0].plot(tel1["Distance"], tel1["Speed"], color=color_1, label=driver_1)
    axes[0].plot(tel2["Distance"], tel2["Speed"], color=color_2, label=driver_2)
    axes[0].set_ylabel("Speed (km/h)")
    axes[0].legend()

    axes[1].plot(tel1["Distance"], tel1["Throttle"], color=color_1, label=driver_1)
    axes[1].plot(tel2["Distance"], tel2["Throttle"], color=color_2, label=driver_2)
    axes[1].set_ylabel("Throttle %")

    axes[2].plot(tel1["Distance"], tel1["Brake"], color=color_1, label=driver_1)
    axes[2].plot(tel2["Distance"], tel2["Brake"], color=color_2, label=driver_2)
    axes[2].set_ylabel("Brake")
    axes[2].set_xlabel("Distance (m)")

    plt.tight_layout()
    plt.savefig("output/02_telemetry_comparison.png")
    print("Saved plot to output/02_telemetry_comparison.png")


if __name__ == "__main__":
    main()
