# System Design, Visually: writing rules

Every lesson follows these rules. Check a lesson against them before it ships.

## Shape of a lesson

1. **The problem.** What breaks without this idea, in numbers a reader can picture.
2. **How it works.** The mechanism, step by step, with a diagram for each step that has moving parts.
3. **In practice.** Real systems that use it, each backed by a source.
4. **Try it.** One interactive diagram where the reader changes the inputs.
5. **Summary.** Three to five lines.
6. **References.** Primary sources only.

## Plain technical English

- One idea per sentence. Keep most sentences under 20 words.
- Use the plain word: "use", not "leverage" or "utilize"; "start", not "initiate"; "about", not "approximately".
- Name the actual thing. Write "the API server", not "the system" or "the backend layer".
- Define a term the first time it appears, in one short sentence. After that, use the same word every time.
- Use technical terms where they are the right name: "429", "token bucket", "TTL". Don't avoid them, define them.
- Use numbers instead of adjectives: "10 requests a second", not "a lot of traffic".
- No metaphors, analogies, jokes or rhetorical questions.
- No filler: "it's worth noting", "in today's world", "simply", "just", "powerful", "robust", "seamless".
- No em dashes. Use a full stop or a comma.
- Lead each paragraph with its main point.
- Bold only the one fact a skimming reader must not miss, at most once per paragraph.

## Facts and sources

- Every claim about a real product, standard or company links to a primary source: an RFC, the official documentation, or the company's own engineering post.
- No source, no claim. Don't write from memory.
- Quote numbers exactly as the source states them, with the source's conditions.
- Say when something is a draft, an estimate or a default that can be changed.
- Each lesson gets a separate check that reads only the lesson and its sources, and lists every sentence the sources don't support.

## Diagrams

- Every diagram runs a simulation. Its key numbers are asserted in a test, so the picture can't drift from the text.
- One accent colour (blue) for the thing being taught. Red only for failures: rejected, timed out, lost.
- Labels are nouns from the text: "API server", "Load balancer", "Shared counter".
- Each figure has a caption that says what to watch for.
