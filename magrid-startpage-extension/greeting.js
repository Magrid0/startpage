function updateGreeting() {
  const hour = new Date().getHours();
  let greeting;

  if (hour < 12) greeting = "Good morning, Magrid.";
  else if (hour < 18) greeting = "Good afternoon, Magrid.";
  else greeting = "Good evening, Magrid.";

  document.getElementById("greeting").textContent = greeting;
}

updateGreeting();
