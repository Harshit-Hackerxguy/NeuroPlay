#include <cstdlib>
#include <ctime>
#include <cmath>
#include <vector>

#if defined(__has_include)
#if __has_include(<emscripten/emscripten.h>)
#include <emscripten/emscripten.h>
#endif
#endif

#if defined(__EMSCRIPTEN__)
#define NP_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define NP_EXPORT
#endif

namespace {
int difficulty = 3;
std::vector<int> sequence;
int expectedIndex = 0;
int totalClicks = 0;
int correctClicks = 0;
int mistakes = 0;
double totalReactionTime = 0.0;
double totalReactionTimeSquared = 0.0;
int roundClicks = 0;
int roundCorrect = 0;
int totalRounds = 0;
int successfulRounds = 0;
int currentStreak = 0;
int bestStreak = 0;

int randomTile() {
  return std::rand() % 4;
}

void generateSequence() {
  sequence.clear();
  sequence.reserve(difficulty);
  for (int i = 0; i < difficulty; i++) {
    sequence.push_back(randomTile());
  }
}
}  // namespace

extern "C" {

NP_EXPORT
int startPuzzle() {
  static bool seeded = false;
  if (!seeded) {
    std::srand(static_cast<unsigned int>(std::time(nullptr)));
    seeded = true;
  }

  generateSequence();
  expectedIndex = 0;
  roundClicks = 0;
  roundCorrect = 0;
  return static_cast<int>(sequence.size());
}

NP_EXPORT
int recordClick(int tile, int reactionTime) {
  if (sequence.empty()) {
    return -1;
  }

  totalClicks++;
  roundClicks++;
  totalReactionTime += reactionTime;
  totalReactionTimeSquared += static_cast<double>(reactionTime) * static_cast<double>(reactionTime);

  if (tile == sequence[expectedIndex]) {
    correctClicks++;
    roundCorrect++;
    expectedIndex++;

    if (expectedIndex >= static_cast<int>(sequence.size())) {
      totalRounds++;
      successfulRounds++;
      currentStreak++;
      if (currentStreak > bestStreak) {
        bestStreak = currentStreak;
      }
      return 1;
    }
    return 0;
  }

  mistakes++;
  totalRounds++;
  currentStreak = 0;
  expectedIndex = 0;
  return -1;
}

NP_EXPORT
void setDifficulty(int level) {
  if (level < 2) {
    difficulty = 2;
  } else if (level > 12) {
    difficulty = 12;
  } else {
    difficulty = level;
  }
}

NP_EXPORT
int getDifficulty() {
  return difficulty;
}

NP_EXPORT
double getAccuracy() {
  if (totalClicks == 0) {
    return 0.0;
  }
  return (static_cast<double>(correctClicks) / static_cast<double>(totalClicks)) * 100.0;
}

NP_EXPORT
double getRoundAccuracy() {
  if (roundClicks == 0) {
    return 0.0;
  }
  return static_cast<double>(roundCorrect) / static_cast<double>(roundClicks);
}

NP_EXPORT
double getAverageReactionTime() {
  if (totalClicks == 0) {
    return 0.0;
  }
  return totalReactionTime / static_cast<double>(totalClicks);
}

NP_EXPORT
double getReactionConsistency() {
  if (totalClicks < 2) {
    return 100.0;
  }

  const double n = static_cast<double>(totalClicks);
  const double mean = totalReactionTime / n;
  if (mean <= 0.0) {
    return 0.0;
  }

  const double variance = (totalReactionTimeSquared / n) - (mean * mean);
  const double safeVariance = variance > 0.0 ? variance : 0.0;
  const double stdDev = std::sqrt(safeVariance);
  const double coeffVar = (stdDev / mean) * 100.0;
  const double score = 100.0 - coeffVar;
  if (score < 0.0) return 0.0;
  if (score > 100.0) return 100.0;
  return score;
}

NP_EXPORT
double getSessionSuccessRate() {
  if (totalRounds == 0) {
    return 0.0;
  }
  return (static_cast<double>(successfulRounds) / static_cast<double>(totalRounds)) * 100.0;
}

NP_EXPORT
int getBestStreak() {
  return bestStreak;
}

NP_EXPORT
int getRoundCount() {
  return totalRounds;
}

NP_EXPORT
int getMistakes() {
  return mistakes;
}

NP_EXPORT
int getSequenceLength() {
  return static_cast<int>(sequence.size());
}

NP_EXPORT
int getSequenceTile(int index) {
  if (index < 0 || index >= static_cast<int>(sequence.size())) {
    return -1;
  }
  return sequence[index];
}

NP_EXPORT
void resetAll() {
  expectedIndex = 0;
  totalClicks = 0;
  correctClicks = 0;
  mistakes = 0;
  totalReactionTime = 0.0;
  totalReactionTimeSquared = 0.0;
  roundClicks = 0;
  roundCorrect = 0;
  totalRounds = 0;
  successfulRounds = 0;
  currentStreak = 0;
  bestStreak = 0;
  sequence.clear();
}

}  // extern "C"
