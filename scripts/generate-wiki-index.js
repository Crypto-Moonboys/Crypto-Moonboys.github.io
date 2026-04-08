    const authorityGraphPoints = Math.round(linkScore.authority * 1);

    // Fold authority_graph_points into authority_points so the validator's
    // 7-field sum (canonical + description + category + word_count + keyword_bag
    // + content_quality + authority) always equals rank_score exactly.
    const updatedAuthorityPoints = rankDiagnostics.authority_points + authorityGraphPoints;
    const updatedFinalRankScore =
      rankDiagnostics.canonical_points +
      rankDiagnostics.description_points +
      rankDiagnostics.category_points +
      rankDiagnostics.word_count_points +
      rankDiagnostics.keyword_bag_points +
      rankDiagnostics.content_quality_points +
      updatedAuthorityPoints;

    const updatedRankDiagnostics = Object.assign({}, rankDiagnostics, {
      authority_points: updatedAuthorityPoints,
      authority_graph_points: authorityGraphPoints,
      final_rank_score: updatedFinalRankScore
    });
