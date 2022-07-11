import {
  compoundExpression, Expression, methodCall, obj, printBlock, ref, set, str,
} from 'graphql-mapping-template';

/**
 * Generate get query resolver template
 */
export const generateQueryRequestTemplate = (statement: string): string => {
  const statements: Expression[] = [
    set(
      ref('lambdaArgs'),
      obj({
        detail: obj({
          args: ref('context.arguments'),
          info: ref('context.info'),
          query: str(statement),
          operation: str('RAW'),
        }),
      }),
    ),
    obj({
      version: str('2017-02-28'),
      operation: str('Invoke'),
      payload: methodCall(ref('util.toJson'), ref('lambdaArgs')),
    }),
  ];
  return printBlock('Query Request')(compoundExpression(statements));
};
