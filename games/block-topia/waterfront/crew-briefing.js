/* Authored map commentary from the Waterfront brief (issue #1921). */
(() => {
  const briefings = [
    ["Finding the harbor",
      "Lumina’s blue lantern gives you a landmark before the first turn.",
      "Keep the landing in view. A door is useful when you can reach it.",
      "Follow the arrival street toward the dock and seawall mural.",
      "A clear route helps first-time visitors on a phone find their way."],
    ["Work at the docks",
      "The docks give the cargo bots somewhere to pick up and drop loads.",
      "Leave room to walk past them. A busy dock still needs a clear path.",
      "Small lamps can mark landings without lighting up the whole harbor.",
      "Keep the lit edge on land so the shoreline still reads at night."],
    ["The seawall mural",
      "The mural gives the graffiti crew its own stretch of the seawall.",
      "Let visitors see the work from the path beside it.",
      "The wet stone and warm doorways carry the rest of the street.",
      "Save the brightest neon for places we want people to notice."],
    ["A place to stop",
      "West Meadow is planned as a garden link to the southern paths.",
      "A low planter can mark a turn while keeping the route in sight.",
      "Southwest Park should give visitors a place to sit off the path.",
      "Set benches beside the paving, with space for two walkers to pass."],
    ["East Common market",
      "East Common is planned as an outdoor market with a walking loop.",
      "Put stalls along that loop so the middle stays open.",
      "A good market gives people a reason to pause after the harbor.",
      "Check each entrance from spawn before filling the square with props."],
    ["Toward South Point",
      "South Point is planned as a lookout and shoreline promenade.",
      "A shelter belongs on land. Keep the water and land easy to tell apart.",
      "East Shore could hold small service sheds and lit dock landings.",
      "The offshore islands stay in view while their routes are designed."],
    ["How the map changes",
      "One builder round can place a bench or planter beside a path.",
      "We check the lot, the walking route and what a saved edit will do.",
      "Players can explore the live map. Spectators can follow test builds.",
      "A proposal goes through review before it reaches the live map."],
  ];

  window.waterfrontCrewBriefing = utcDay => {
    const [title, ...lines] = briefings[utcDay];
    return { title, turns: lines.map((text, index) => ({ speaker: index % 2, text })) };
  };
})();
