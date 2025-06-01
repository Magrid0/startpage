function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = now.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  document.getElementById("time").textContent = timeStr;
  document.getElementById("date").textContent = dateStr;
}

updateClock();
setInterval(updateClock, 1000);
