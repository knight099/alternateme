export default function prompts(): Response {
  return Response.json({prompts:[
    "What would you invite a flatmate to join?",
    "What does a quiet evening at home look like for you?",
    "Which hobby takes up the most space in your week?"
  ]});
}
